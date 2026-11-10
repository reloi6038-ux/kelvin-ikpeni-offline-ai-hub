// server/routes/sync.js
const express = require('express');
const mongoose = require('mongoose');
const Attempt  = require('../models/Attempt');
const Quiz     = require('../models/Quiz');
const SyncQueue = require('../models/SyncQueue');
const { ok, fail } = require('../utils/helpers');
const logger = require('../utils/logger');

const router = express.Router();

// Sync payloads are small; cap the body size harder than the global 5MB
router.use(express.json({ limit: '200kb' }));

const MAX_BATCH_SIZE = 50;
const MAX_PAYLOAD_BYTES = 100 * 1024; // 100KB per batch

// ============================================================
// POST /api/sync/attempt — single-attempt sync (idempotent)
// ============================================================
router.post('/attempt', async (req, res) => {
  try {
    const b = req.body || {};
    const validation = validateSyncAttempt(b);
    if (validation) return fail(res, 400, validation, 'INVALID_PAYLOAD');

    // Duplicate check FIRST — most common path
    const existing = await Attempt.findOne({ clientId: b.clientId }).lean();
    if (existing) {
      return res.status(200).json(ok({
        duplicate: true,
        attemptId: existing._id.toString(),
        score: existing.score,
        total: existing.total,
        percent: existing.percent
      }));
    }

    const quiz = await Quiz.findOne({ _id: b.quizId, isPublished: true }).lean();
    if (!quiz) return fail(res, 404, 'Quiz not found', 'QUIZ_NOT_FOUND');

    const scored = scoreAttemptFromServer(quiz, b.answers);
    const attempt = await Attempt.create({
      userId: b.userId && mongoose.isValidObjectId(b.userId) ? b.userId : null,
      anonymousId: sanitizeAnonId(b.anonymousId),
      quizId: quiz._id,
      lessonId: quiz.lessonId || null,
      answers: scored.answers,
      score: scored.score,
      total: scored.total,
      percent: scored.percent,
      clientTimestamp: new Date(b.clientTimestamp),
      syncedAt: new Date(),
      clientId: b.clientId,
      weakTopicHints: scored.weakTopicHints
    });

    // Record in SyncQueue for audit (best-effort)
    await SyncQueue.create({
      userId: attempt.userId,
      anonymousId: attempt.anonymousId,
      action: 'quiz_attempt',
      payload: { attemptId: attempt._id.toString(), quizId: quiz._id.toString() },
      clientId: `${b.clientId}_queue`,
      status: 'applied',
      clientTimestamp: new Date(b.clientTimestamp),
      processedAt: new Date()
    }).catch(() => {}); // non-fatal

    return res.status(201).json(ok({
      attemptId: attempt._id.toString(),
      score: attempt.score,
      total: attempt.total,
      percent: attempt.percent,
      weakTopicHints: attempt.weakTopicHints
    }));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(200).json(ok({ duplicate: true, message: 'Already synced.' }));
    }
    logger.error(`POST /api/sync/attempt → ${err.message}`);
    return fail(res, 500, 'Sync failed', 'SYNC_ERROR');
  }
});

// ============================================================
// POST /api/sync/batch — batch sync multiple attempts (max 50)
// Body: { attempts: [ { clientId, quizId, answers, clientTimestamp, ... }, ... ] }
// ============================================================
router.post('/batch', async (req, res) => {
  try {
    const b = req.body || {};
    if (!Array.isArray(b.attempts)) {
      return fail(res, 400, 'attempts must be an array', 'INVALID_PAYLOAD');
    }
    if (b.attempts.length === 0) {
      return fail(res, 400, 'attempts array is empty', 'INVALID_PAYLOAD');
    }
    if (b.attempts.length > MAX_BATCH_SIZE) {
      return fail(res, 413, `Batch exceeds ${MAX_BATCH_SIZE} items`, 'BATCH_TOO_LARGE');
    }
    const rawSize = JSON.stringify(b.attempts).length;
    if (rawSize > MAX_PAYLOAD_BYTES) {
      return fail(res, 413, `Batch payload exceeds ${MAX_PAYLOAD_BYTES} bytes`, 'BATCH_TOO_LARGE');
    }

    const results = [];
    for (const item of b.attempts) {
      try {
        const validation = validateSyncAttempt(item);
        if (validation) {
          results.push({ clientId: item.clientId, status: 'rejected', reason: validation });
          continue;
        }

        const existing = await Attempt.findOne({ clientId: item.clientId }).lean();
        if (existing) {
          results.push({
            clientId: item.clientId,
            status: 'duplicate',
            attemptId: existing._id.toString(),
            percent: existing.percent
          });
          continue;
        }

        const quiz = await Quiz.findById(item.quizId).lean();
        if (!quiz) {
          results.push({ clientId: item.clientId, status: 'rejected', reason: 'Quiz not found' });
          continue;
        }

        const scored = scoreAttemptFromServer(quiz, item.answers);
        const attempt = await Attempt.create({
          userId: item.userId && mongoose.isValidObjectId(item.userId) ? item.userId : null,
          anonymousId: sanitizeAnonId(item.anonymousId),
          quizId: quiz._id,
          lessonId: quiz.lessonId || null,
          answers: scored.answers,
          score: scored.score,
          total: scored.total,
          percent: scored.percent,
          clientTimestamp: new Date(item.clientTimestamp),
          syncedAt: new Date(),
          clientId: item.clientId,
          weakTopicHints: scored.weakTopicHints
        });
        results.push({
          clientId: item.clientId,
          status: 'applied',
          attemptId: attempt._id.toString(),
          percent: attempt.percent
        });
      } catch (itemErr) {
        if (itemErr.code === 11000) {
          results.push({ clientId: item.clientId, status: 'duplicate' });
        } else {
          logger.warn(`Batch item failed: ${itemErr.message}`);
          results.push({ clientId: item.clientId, status: 'error', reason: 'Server error' });
        }
      }
    }

    const summary = {
      total: results.length,
      applied: results.filter((r) => r.status === 'applied').length,
      duplicate: results.filter((r) => r.status === 'duplicate').length,
      rejected: results.filter((r) => r.status === 'rejected').length,
      errors: results.filter((r) => r.status === 'error').length
    };

    return res.status(200).json(ok({ results, summary }));
  } catch (err) {
    logger.error(`POST /api/sync/batch → ${err.message}`);
    return fail(res, 500, 'Batch sync failed', 'SYNC_ERROR');
  }
});

// ============================================================
// POST /api/sync/status — verify what the server has received
// Body: { clientIds: ["abc123", ...] }
// Returns which ones exist and which are still pending.
// ============================================================
router.post('/status', async (req, res) => {
  try {
    const b = req.body || {};
    if (!Array.isArray(b.clientIds) || b.clientIds.length === 0) {
      return fail(res, 400, 'clientIds must be a non-empty array', 'INVALID_PAYLOAD');
    }
    if (b.clientIds.length > 200) {
      return fail(res, 413, 'Too many clientIds (200 max)', 'BATCH_TOO_LARGE');
    }
    const sanitized = b.clientIds.filter((id) => typeof id === 'string' && id.length <= 64);

    const found = await Attempt.find(
      { clientId: { $in: sanitized } },
      { clientId: 1, _id: 1, percent: 1 }
    ).lean();

    const foundMap = new Map(found.map((f) => [f.clientId, f]));
    const result = sanitized.map((cid) => {
      const f = foundMap.get(cid);
      return f
        ? { clientId: cid, status: 'received', attemptId: f._id.toString(), percent: f.percent }
        : { clientId: cid, status: 'pending' };
    });

    return res.json(ok({
      received: result.filter((r) => r.status === 'received').length,
      pending: result.filter((r) => r.status === 'pending').length,
      results: result
    }));
  } catch (err) {
    logger.error(`POST /api/sync/status → ${err.message}`);
    return fail(res, 500, 'Status check failed', 'SYNC_ERROR');
  }
});

// ============================================================
// Helpers
// ============================================================

function validateSyncAttempt(b) {
  if (!b || typeof b !== 'object') return 'Invalid attempt item';
  if (typeof b.clientId !== 'string' || !/^[a-zA-Z0-9_\-]{8,64}$/.test(b.clientId)) {
    return 'clientId must be 8-64 alphanumeric characters';
  }
  if (!mongoose.isValidObjectId(b.quizId)) return 'quizId must be a valid ObjectId';
  if (!Array.isArray(b.answers) || b.answers.length === 0) return 'answers must be a non-empty array';
  for (const a of b.answers) {
    if (!Number.isInteger(a.questionIndex) || !Number.isInteger(a.selectedIndex)) {
      return 'answers items need integer questionIndex and selectedIndex';
    }
  }
  if (!b.clientTimestamp || isNaN(Date.parse(b.clientTimestamp))) {
    return 'clientTimestamp must be a valid ISO date';
  }
  // Reject attempts more than 90 days old (protects analytics)
  const ageMs = Date.now() - new Date(b.clientTimestamp).getTime();
  if (ageMs > 90 * 24 * 60 * 60 * 1000) {
    return 'clientTimestamp is too old (over 90 days)';
  }
  return null;
}

function sanitizeAnonId(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return /^anon_[a-zA-Z0-9\-]{3,64}$/.test(trimmed) ? trimmed : null;
}

function scoreAttemptFromServer(quiz, clientAnswers) {
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
      if (q.explanation) weakTopicHints.add(`missed_q${idx + 1}`);
    }
    return { questionIndex: idx, selectedIndex: selected, isCorrect };
  });
  const total = quiz.questions.length;
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;
  return { answers: scoredAnswers, score, total, percent, weakTopicHints: Array.from(weakTopicHints).slice(0, 8) };
}

module.exports = router;