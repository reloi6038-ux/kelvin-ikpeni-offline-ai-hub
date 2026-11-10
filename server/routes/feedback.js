// server/routes/feedback.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const Feedback = require('../models/Feedback');
const { requireAdmin } = require('../middleware/auth');
const { ok, fail, parsePagination } = require('../utils/helpers');
const logger = require('../utils/logger');

const router = express.Router();

// Public feedback submission — allows anonymous but rate-limits aggressively
const submitLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many feedback submissions. Try again in a minute.', code: 'FEEDBACK_RATE_LIMIT' }
});

const FEEDBACK_TYPES = ['ai_incorrect', 'content_outdated', 'broken_lesson', 'technical', 'other'];

// ============================================================
// POST /api/feedback — public submission
// Body: { type, message, relatedLessonId?, relatedQuizId?, relatedPackId?, pageUrl?, anonymousId? }
// ============================================================
router.post('/', submitLimiter, async (req, res) => {
  try {
    const b = req.body || {};

    if (!FEEDBACK_TYPES.includes(b.type)) {
      return fail(res, 400, `type must be one of: ${FEEDBACK_TYPES.join(', ')}`, 'INVALID_TYPE');
    }
    if (typeof b.message !== 'string' || b.message.trim().length < 10) {
      return fail(res, 400, 'message must be at least 10 characters', 'INVALID_MESSAGE');
    }
    if (b.message.length > 2000) {
      return fail(res, 400, 'message must be 2000 characters or fewer', 'MESSAGE_TOO_LONG');
    }

    const refFields = {};
    for (const field of ['relatedLessonId', 'relatedQuizId', 'relatedPackId']) {
      if (b[field]) {
        if (!mongoose.isValidObjectId(b[field])) {
          return fail(res, 400, `${field} must be a valid ObjectId`, 'INVALID_PAYLOAD');
        }
        refFields[field] = b[field];
      }
    }

    const doc = await Feedback.create({
      userId: null, // no auth yet — students write anonymously
      anonymousId: typeof b.anonymousId === 'string' && /^anon_[a-zA-Z0-9\-]{8,64}$/.test(b.anonymousId)
        ? b.anonymousId : null,
      type: b.type,
      message: b.message.trim(),
      ...refFields,
      pageUrl: typeof b.pageUrl === 'string' ? b.pageUrl.slice(0, 300) : '',
      deviceInfo: (req.header('user-agent') || '').slice(0, 200)
    });

    logger.info(`Feedback received: ${doc.type} (${doc._id})`);
    return res.status(201).json(ok({
      id: doc._id.toString(),
      message: 'Thank you. Your feedback helps us improve the learning content.'
    }));
  } catch (err) {
    logger.error(`POST /api/feedback → ${err.message}`);
    return fail(res, 500, 'Could not save feedback', 'FEEDBACK_SAVE_ERROR');
  }
});

// ============================================================
// GET /api/feedback — admin listing
// Query: ?status=open&type=ai_incorrect&page=1&limit=20
// ============================================================
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type)   filter.type = req.query.type;

    const [items, total] = await Promise.all([
      Feedback.find(filter)
        .sort({ status: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('relatedLessonId', 'title level')
        .populate('relatedPackId', 'name slug')
        .lean(),
      Feedback.countDocuments(filter)
    ]);

    const shaped = items.map((f) => ({
      id: f._id.toString(),
      type: f.type,
      message: f.message,
      status: f.status,
      lesson: f.relatedLessonId || null,
      pack: f.relatedPackId || null,
      pageUrl: f.pageUrl,
      deviceInfo: f.deviceInfo,
      adminNote: f.adminNote,
      createdAt: f.createdAt,
      resolvedAt: f.resolvedAt
    }));

    return res.json(ok(shaped, { page, limit, total, pages: Math.ceil(total / limit) }));
  } catch (err) {
    logger.error(`GET /api/feedback → ${err.message}`);
    return fail(res, 500, 'Failed to load feedback', 'FEEDBACK_LIST_ERROR');
  }
});

// ============================================================
// PATCH /api/feedback/:id — admin updates status / adminNote
// Body: { status?, adminNote? }
// ============================================================
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return fail(res, 400, 'Invalid id', 'INVALID_ID');
    }
    const allowedStatus = ['open', 'reviewing', 'resolved', 'dismissed'];
    const updates = {};
    if (req.body.status !== undefined) {
      if (!allowedStatus.includes(req.body.status)) {
        return fail(res, 400, `status must be one of: ${allowedStatus.join(', ')}`, 'INVALID_STATUS');
      }
      updates.status = req.body.status;
      if (req.body.status === 'resolved' || req.body.status === 'dismissed') {
        updates.resolvedAt = new Date();
      }
    }
    if (req.body.adminNote !== undefined) {
      if (typeof req.body.adminNote !== 'string' || req.body.adminNote.length > 1000) {
        return fail(res, 400, 'adminNote must be a string ≤1000 chars', 'INVALID_PAYLOAD');
      }
      updates.adminNote = req.body.adminNote;
    }
    if (Object.keys(updates).length === 0) {
      return fail(res, 400, 'No updates provided', 'NO_UPDATES');
    }

    const doc = await Feedback.findByIdAndUpdate(req.params.id, updates, { returnDocument: 'after' }).lean();
    if (!doc) return fail(res, 404, 'Feedback not found', 'FEEDBACK_NOT_FOUND');

    return res.json(ok({
      id: doc._id.toString(),
      status: doc.status,
      adminNote: doc.adminNote,
      resolvedAt: doc.resolvedAt
    }));
  } catch (err) {
    logger.error(`PATCH /api/feedback/:id → ${err.message}`);
    return fail(res, 500, 'Failed to update feedback', 'FEEDBACK_UPDATE_ERROR');
  }
});

module.exports = router;