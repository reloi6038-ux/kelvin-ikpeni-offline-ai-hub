// server/routes/ai.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const aiService = require('../services/aiService');
const { ok, fail } = require('../utils/helpers');
const logger = require('../utils/logger');

const router = express.Router();

const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please wait a minute.', code: 'AI_RATE_LIMIT' }
});
router.use(aiLimiter);

const ACTIONS = ['explain_simply', 'give_examples', 'practice_questions', 'summarize'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const LANGUAGES = ['en', 'pidgin', 'ha', 'ig', 'yo'];

function validateBasePayload(body) {
  if (!body || !mongoose.isValidObjectId(body.lessonId)) {
    return 'Invalid or missing lessonId';
  }
  return null;
}

// ============================================================
// POST /api/ai/ask — free-form question
// MUST be declared BEFORE /:action
// ============================================================
router.post('/ask', async (req, res) => {
  try {
    const validationError = validateBasePayload(req.body);
    if (validationError) return fail(res, 400, validationError, 'INVALID_PAYLOAD');

    const question = String(req.body.question || '').trim();
    if (question.length < 3) {
      return fail(res, 400, 'Question is too short', 'QUESTION_TOO_SHORT');
    }
    if (question.length > 400) {
      return fail(res, 400, 'Question is too long (400 chars max)', 'QUESTION_TOO_LONG');
    }

    const result = await aiService.askGrounded({
      lessonId: req.body.lessonId,
      question,
      learningDifficulty: DIFFICULTIES.includes(req.body.learningDifficulty)
        ? req.body.learningDifficulty : 'beginner'
    });

    if (!result.ok) {
      return fail(res, result.status || 500, result.code || 'AI_ERROR', result.code);
    }

    res.set('Cache-Control', 'no-store');
    return res.json(ok({
      question,
      ...result.response,
      disclaimer: 'AI-generated content. Always verify with your teacher or textbook.'
    }));
  } catch (err) {
    logger.error(`POST /api/ai/ask → ${err.message}`);
    return fail(res, 500, 'AI request failed', 'AI_ERROR');
  }
});

// ============================================================
// POST /api/ai/explain_mistake
// MUST be declared BEFORE /:action
// ============================================================
router.post('/explain_mistake', async (req, res) => {
  try {
    const b = req.body || {};
    if (!mongoose.isValidObjectId(b.lessonId)) {
      return fail(res, 400, 'Invalid lessonId', 'INVALID_PAYLOAD');
    }
    if (typeof b.questionText !== 'string' || b.questionText.length < 3) {
      return fail(res, 400, 'Invalid questionText', 'INVALID_PAYLOAD');
    }
    if (!Array.isArray(b.options) || b.options.length < 2) {
      return fail(res, 400, 'options must be an array of at least 2', 'INVALID_PAYLOAD');
    }
    if (!Number.isInteger(b.selectedIndex) || !Number.isInteger(b.correctIndex)) {
      return fail(res, 400, 'selectedIndex and correctIndex must be integers', 'INVALID_PAYLOAD');
    }

    const result = await aiService.explainMistake({
      lessonId: b.lessonId,
      questionText: b.questionText.slice(0, 500),
      options: b.options.slice(0, 6).map((o) => String(o).slice(0, 200)),
      selectedIndex: b.selectedIndex,
      correctIndex: b.correctIndex,
      officialExplanation: (b.officialExplanation || '').slice(0, 500)
    });

    if (!result.ok) {
      return fail(res, result.status || 500, result.code || 'AI_ERROR', result.code);
    }

    res.set('Cache-Control', 'no-store');
    return res.json(ok({
      ...result.response,
      disclaimer: 'AI-generated content. Always verify with your teacher or textbook.'
    }));
  } catch (err) {
    logger.error(`POST /api/ai/explain_mistake → ${err.message}`);
    return fail(res, 500, 'AI request failed', 'AI_ERROR');
  }
});

// ============================================================
// POST /api/ai/:action — catch-all for the 4 simple actions
// MUST be declared AFTER /ask and /explain_mistake
// ============================================================
router.post('/:action', async (req, res) => {
  try {
    const { action } = req.params;
    if (!ACTIONS.includes(action)) {
      return fail(res, 400, `Unsupported action. Allowed: ${ACTIONS.join(', ')}`, 'INVALID_ACTION');
    }

    const validationError = validateBasePayload(req.body);
    if (validationError) return fail(res, 400, validationError, 'INVALID_PAYLOAD');

    const learningDifficulty = DIFFICULTIES.includes(req.body.learningDifficulty)
      ? req.body.learningDifficulty : 'beginner';
    const language = LANGUAGES.includes(req.body.language)
      ? req.body.language : 'en';

    const result = await aiService.getAIResponse({
      lessonId: req.body.lessonId,
      action,
      learningDifficulty,
      language
    });

    if (!result.ok) {
      return fail(res, result.status || 500, result.code || 'AI_ERROR', result.code);
    }

    res.set('Cache-Control', 'no-store');
    return res.json(ok({
      action,
      ...result.response,
      disclaimer: 'AI-generated content. Always verify with your teacher or textbook.'
    }));
  } catch (err) {
    logger.error(`POST /api/ai/:action → ${err.message}`);
    return fail(res, 500, 'AI request failed', 'AI_ERROR');
  }
});

// ============================================================
// GET /api/ai/status
// ============================================================
router.get('/status', async (req, res) => {
  const { getAIConfig } = require('../config/ai');
  const cfg = getAIConfig();
  return res.json(ok({
    providerEnabled: cfg.enabled,
    provider: cfg.provider,
    model: cfg.enabled ? cfg.model : null,
    supportedActions: ACTIONS,
    mode: cfg.enabled ? 'online_with_fallback' : 'template_and_cache_only'
  }));
});

module.exports = router;