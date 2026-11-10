// server/routes/quiz.js
const express = require('express');
const mongoose = require('mongoose');
const Quiz     = require('../models/Quiz');
const Attempt  = require('../models/Attempt');
const Lesson   = require('../models/Lesson');
const { ok, fail, parsePagination } = require('../utils/helpers');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================================
// GET /api/quiz/lesson/:lessonId — all quizzes for a lesson
// (declared BEFORE /:id so "lesson" isn't parsed as an id)
// ============================================================
router.get('/lesson/:lessonId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.lessonId)) {
      return fail(res, 400, 'Invalid lesson id', 'INVALID_ID');
    }
    const quizzes = await Quiz.find({
      lessonId: req.params.lessonId,
      isPublished: true
    })
      .select('title level contentType passingScore timeLimitMinutes questions')
      .lean();

    res.set('Cache-Control', 'public, max-age=600');
    return res.json(ok(quizzes.map((q) => ({
      id: q._id.toString(),
      title: q.title,
      level: q.level,
      contentType: q.contentType,
      passingScore: q.passingScore,
      timeLimitMinutes: q.timeLimitMinutes,
      questionCount: q.questions.length,
      questions: q.questions.map((qq) => ({
        questionText: qq.questionText,
        options: qq.options,
        correctIndex: qq.correctIndex,
        explanation: qq.explanation,
        difficulty: qq.difficulty
      }))
    }))));
  } catch (err) {
    logger.error(`GET /api/quiz/lesson/:id → ${err.message}`);
    return fail(res, 500, 'Failed to load quizzes', 'QUIZ_LIST_ERROR');
  }
});

// ============================================================
// GET /api/quiz/:id — fetch a quiz (full, including correct answers)
// Note: correct answers ARE included since the client scores offline.
// This is a deliberate trade-off for zero-bandwidth learning.
// ============================================================
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return fail(res, 400, 'Invalid quiz id', 'INVALID_ID');
    }
    const quiz = await Quiz.findOne({ _id: req.params.id, isPublished: true }).lean();
    if (!quiz) return fail(res, 404, 'Quiz not found', 'QUIZ_NOT_FOUND');

    res.set('Cache-Control', 'public, max-age=600');
    return res.json(ok({
      id: quiz._id.toString(),
      title: quiz.title,
      lessonId: quiz.lessonId ? quiz.lessonId.toString() : null,
      subjectId: quiz.subjectId ? quiz.subjectId.toString() : null,
      level: quiz.level,
      contentType: quiz.contentType,
      passingScore: quiz.passingScore,
      timeLimitMinutes: quiz.timeLimitMinutes,
      questions: quiz.questions.map((q) => ({
        questionText: q.questionText,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        difficulty: q.difficulty
      }))
    }));
  } catch (err) {
    logger.error(`GET /api/quiz/:id → ${err.message}`);
    return fail(res, 500, 'Failed to load quiz', 'QUIZ_FETCH_ERROR');
  }
});

// ============================================================
// POST /api/quiz/:id/attempt — online submission
// Body: { clientId, answers: [{ questionIndex, selectedIndex }], clientTimestamp }
// Server re-scores. Returns the authoritative score.
// ============================================================
router.post('/:id/attempt', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return fail(res, 400, 'Invalid quiz id', 'INVALID_ID');
    }
    const validation = validateAttemptPayload(req.body);
    if (validation) return fail(res, 400, validation, 'INVALID_PAYLOAD');

    const quiz = await Quiz.findOne({ _id: req.params.id, isPublished: true }).lean();
    if (!quiz) return fail(res, 404, 'Quiz not found', 'QUIZ_NOT_FOUND');

    // Idempotency check
    const existing = await Attempt.findOne({ clientId: req.body.clientId }).lean();
    if (existing) {
      return res.status(200).json(ok({
        duplicate: true,
        attemptId: existing._id.toString(),
        score: existing.score,
        total: existing.total,
        percent: existing.percent,
        message: 'Attempt already recorded.'
      }));
    }

    const scored = scoreAttempt(quiz, req.body.answers);
    const attempt = await Attempt.create({
      userId: req.body.userId && mongoose.isValidObjectId(req.body.userId) ? req.body.userId : null,
      anonymousId: sanitizeAnonId(req.body.anonymousId),
      quizId: quiz._id,
      lessonId: quiz.lessonId || null,
      answers: scored.answers,
      score: scored.score,
      total: scored.total,
      percent: scored.percent,
      clientTimestamp: new Date(req.body.clientTimestamp),
      syncedAt: new Date(),
      clientId: req.body.clientId,
      weakTopicHints: scored.weakTopicHints
    });

    return res.status(201).json(ok({
      attemptId: attempt._id.toString(),
      score: attempt.score,
      total: attempt.total,
      percent: attempt.percent,
      weakTopicHints: attempt.weakTopicHints,
      passed: attempt.percent >= quiz.passingScore
    }));
  } catch (err) {
    if (err.code === 11000) {
      // Unique index raced — return duplicate info
      return res.status(200).json(ok({ duplicate: true, message: 'Already recorded.' }));
    }
    logger.error(`POST /api/quiz/:id/attempt → ${err.message}`);
    return fail(res, 500, 'Failed to save attempt', 'ATTEMPT_SAVE_ERROR');
  }
});

// ============================================================
// GET /api/quiz/:id/attempts — attempt history (limited)
// Optional ?anonymousId=... for anonymous users
// ============================================================
router.get('/:id/attempts', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return fail(res, 400, 'Invalid quiz id', 'INVALID_ID');
    }
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 30 });
    const filter = { quizId: req.params.id };
    if (req.query.anonymousId) filter.anonymousId = sanitizeAnonId(req.query.anonymousId);

    const [items, total] = await Promise.all([
      Attempt.find(filter)
        .sort({ clientTimestamp: -1 })
        .skip(skip)
        .limit(limit)
        .select('score total percent clientTimestamp weakTopicHints')
        .lean(),
      Attempt.countDocuments(filter)
    ]);

    return res.json(ok(items.map((a) => ({
      score: a.score,
      total: a.total,
      percent: a.percent,
      takenAt: a.clientTimestamp,
      weakTopicHints: a.weakTopicHints || []
    })), { page, limit, total, pages: Math.ceil(total / limit) }));
  } catch (err) {
    logger.error(`GET /api/quiz/:id/attempts → ${err.message}`);
    return fail(res, 500, 'Failed to load attempts', 'ATTEMPTS_LIST_ERROR');
  }
});

// ============================================================
// Helpers
// ============================================================

function validateAttemptPayload(body) {
  if (!body || typeof body !== 'object') return 'Request body is required';
  if (typeof body.clientId !== 'string' || !/^[a-zA-Z0-9_\-]{8,64}$/.test(body.clientId)) {
    return 'clientId must be 8-64 alphanumeric characters';
  }
  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    return 'answers must be a non-empty array';
  }
  for (const a of body.answers) {
    if (!Number.isInteger(a.questionIndex) || !Number.isInteger(a.selectedIndex)) {
      return 'Each answer must have integer questionIndex and selectedIndex';
    }
  }
  if (!body.clientTimestamp || isNaN(Date.parse(body.clientTimestamp))) {
    return 'clientTimestamp must be a valid ISO date';
  }
  return null;
}

function sanitizeAnonId(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return /^anon_[a-zA-Z0-9\-]{8,64}$/.test(trimmed) ? trimmed : null;
}

/**
 * Server-side scoring — never trust the client's reported score.
 * Also builds weakTopicHints from questions missed.
 */
function scoreAttempt(quiz, clientAnswers) {
  const answerMap = new Map();
  for (const a of clientAnswers) {
    if (a.questionIndex >= 0 && a.questionIndex < quiz.questions.length) {
      answerMap.set(a.questionIndex, a.selectedIndex);
    }
  }

  let score = 0;
  const weakTopicHints = new Set();
  const scoredAnswers = quiz.questions.map((q, idx) => {
    const selected = answerMap.has(idx) ? answerMap.get(idx) : -1;
    const isCorrect = selected === q.correctIndex;
    if (isCorrect) score++;
    else {
      weakTopicHints.add(q.difficulty || 'medium');
      (q.options || []).slice(0, 1).forEach((opt) => {
        if (opt && opt.length < 40) weakTopicHints.add(opt.toLowerCase());
      });
    }
    return {
      questionIndex: idx,
      selectedIndex: selected,
      isCorrect
    };
  });

  const total = quiz.questions.length;
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;

  return {
    answers: scoredAnswers,
    score,
    total,
    percent,
    weakTopicHints: Array.from(weakTopicHints).slice(0, 8)
  };
}

module.exports = router;