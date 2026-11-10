// server/routes/lessons.js
const express = require('express');
const mongoose = require('mongoose');
const Lesson  = require('../models/Lesson');
const Subject = require('../models/Subject');
const { ok, fail, parsePagination, parseFields } = require('../utils/helpers');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/lessons
 * Query: ?subject=mathematics&level=JSS2&curriculum=Nigerian&language=en
 *        &contentType=verified_curriculum&q=fractions
 *        &page=1&limit=20&fields=title,summary
 */
router.get('/', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { isPublished: true };

    // Subject filter — accept slug or ObjectId
    if (req.query.subject) {
      if (mongoose.isValidObjectId(req.query.subject)) {
        filter.subjectId = req.query.subject;
      } else {
        const subj = await Subject.findOne({ slug: req.query.subject.toLowerCase() }).select('_id').lean();
        if (!subj) return fail(res, 404, 'Subject not found', 'SUBJECT_NOT_FOUND');
        filter.subjectId = subj._id;
      }
    }

    if (req.query.level)       filter.level = req.query.level;
    if (req.query.curriculum)  filter.curriculum = req.query.curriculum;
    if (req.query.language)    filter.language = req.query.language;
    if (req.query.contentType) filter.contentType = req.query.contentType;

    // Text search — falls back to regex if Mongo text index isn't ready
    let sort = { order: 1, title: 1 };
    if (req.query.q) {
      const q = String(req.query.q).slice(0, 80).trim();
      if (q.length > 0) {
        filter.$text = { $search: q };
        sort = { score: { $meta: 'textScore' }, order: 1 };
      }
    }

    const projection = parseFields(req.query, [
      'title', 'slug', 'summary', 'level', 'curriculum', 'contentType',
      'estimatedMinutes', 'order', 'version', 'language', 'sourceRef', 'keywords'
    ]);

    const query = Lesson.find(filter, projection)
      .sort(sort)
      .skip(skip)
      .limit(limit);

    if (req.query.q) query.select({ score: { $meta: 'textScore' } });

    const [items, total] = await Promise.all([
      query.lean(),
      Lesson.countDocuments(filter)
    ]);

    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    return res.json(ok(items, {
      page, limit, total, pages: Math.ceil(total / limit),
      query: req.query.q || null
    }));
  } catch (err) {
    logger.error(`GET /api/lessons → ${err.message}`);
    return fail(res, 500, 'Failed to load lessons', 'LESSONS_LIST_ERROR');
  }
});

/**
 * GET /api/lessons/:id
 * Returns the full lesson including content, keyPoints, keywords.
 * Public — but only for published lessons.
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return fail(res, 400, 'Invalid lesson id', 'INVALID_ID');
    }

    const lesson = await Lesson.findOne({ _id: id, isPublished: true })
      .populate('subjectId', 'name slug icon color')
      .lean();

    if (!lesson) return fail(res, 404, 'Lesson not found', 'LESSON_NOT_FOUND');

    // Cached by stable id
    res.set('Cache-Control', 'public, max-age=600');
    return res.json(ok(lesson));
  } catch (err) {
    logger.error(`GET /api/lessons/:id → ${err.message}`);
    return fail(res, 500, 'Failed to load lesson', 'LESSON_FETCH_ERROR');
  }
});

/**
 * GET /api/lessons/search/offline
 * Lightweight endpoint for the offline content search page.
 * Returns only id, title, subject slug, level, and first 120 chars of content.
 * Deliberately tiny payload for low-data users.
 */
router.get('/search/offline', async (req, res) => {
  try {
    const q = String(req.query.q || '').slice(0, 80).trim();
    if (q.length < 2) {
      return fail(res, 400, 'Query must be at least 2 characters', 'QUERY_TOO_SHORT');
    }

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 20 });

    const lessons = await Lesson.find(
      { isPublished: true, $text: { $search: q } },
      { score: { $meta: 'textScore' }, title: 1, summary: 1, level: 1, subjectId: 1 }
    )
      .sort({ score: { $meta: 'textScore' } })
      .skip(skip)
      .limit(limit)
      .populate('subjectId', 'name slug icon')
      .lean();

    // Truncate summaries to 120 chars server-side
    const items = lessons.map((l) => ({
      id: l._id.toString(),
      title: l.title,
      summary: (l.summary || '').slice(0, 120),
      level: l.level,
      subject: l.subjectId
    }));

    res.set('Cache-Control', 'public, max-age=120');
    return res.json(ok(items, { page, limit, query: q }));
  } catch (err) {
    logger.error(`GET /api/lessons/search/offline → ${err.message}`);
    return fail(res, 500, 'Search failed', 'SEARCH_ERROR');
  }
});

module.exports = router;
