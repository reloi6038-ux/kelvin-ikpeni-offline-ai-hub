// server/routes/subjects.js
const express = require('express');
const mongoose = require('mongoose');
const Subject = require('../models/Subject');
const Lesson  = require('../models/Lesson');
const { ok, fail, parsePagination, parseFields } = require('../utils/helpers');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/subjects
 * Query: ?curriculum=Nigerian&level=JSS2&active=true&page=1&limit=20&fields=name,icon
 */
router.get('/', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { isActive: true };

    if (req.query.curriculum) filter.curriculum = req.query.curriculum;
    if (req.query.level)      filter.levels = req.query.level;
    if (req.query.active === 'false') filter.isActive = false;

    const projection = parseFields(req.query, [
      'name', 'slug', 'icon', 'color', 'description', 'curriculum', 'levels', 'lessonCount'
    ]);

    const [items, total] = await Promise.all([
      Subject.find(filter, projection)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Subject.countDocuments(filter)
    ]);

    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    return res.json(ok(items, {
      page, limit, total, pages: Math.ceil(total / limit)
    }));
  } catch (err) {
    logger.error(`GET /api/subjects → ${err.message}`);
    return fail(res, 500, 'Failed to load subjects', 'SUBJECTS_LIST_ERROR');
  }
});

/**
 * GET /api/subjects/:idOrSlug
 * Accepts Mongo ObjectId OR slug (e.g. "mathematics").
 */
router.get('/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const query = mongoose.isValidObjectId(idOrSlug)
      ? { _id: idOrSlug }
      : { slug: idOrSlug.toLowerCase() };

    const subject = await Subject.findOne(query).lean();
    if (!subject) return fail(res, 404, 'Subject not found', 'SUBJECT_NOT_FOUND');

    res.set('Cache-Control', 'public, max-age=300');
    return res.json(ok(subject));
  } catch (err) {
    logger.error(`GET /api/subjects/:id → ${err.message}`);
    return fail(res, 500, 'Failed to load subject', 'SUBJECT_FETCH_ERROR');
  }
});

/**
 * GET /api/subjects/:idOrSlug/lessons
 * All published lessons for a subject, optionally filtered by level.
 * Query: ?level=JSS2&published=true&page=1&limit=20&fields=title,level,estimatedMinutes
 */
router.get('/:idOrSlug/lessons', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const query = mongoose.isValidObjectId(idOrSlug)
      ? { _id: idOrSlug }
      : { slug: idOrSlug.toLowerCase() };

    const subject = await Subject.findOne(query).select('_id').lean();
    if (!subject) return fail(res, 404, 'Subject not found', 'SUBJECT_NOT_FOUND');

    const { page, limit, skip } = parsePagination(req.query);
    const filter = { subjectId: subject._id, isPublished: true };
    if (req.query.level)  filter.level = req.query.level;
    if (req.query.language) filter.language = req.query.language;

    const projection = parseFields(req.query, [
      'title', 'slug', 'summary', 'level', 'curriculum', 'contentType',
      'estimatedMinutes', 'order', 'version', 'language', 'sourceRef'
    ]);

    const [items, total] = await Promise.all([
      Lesson.find(filter, projection)
        .sort({ order: 1, title: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Lesson.countDocuments(filter)
    ]);

    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    return res.json(ok(items, { page, limit, total, pages: Math.ceil(total / limit) }));
  } catch (err) {
    logger.error(`GET /api/subjects/:id/lessons → ${err.message}`);
    return fail(res, 500, 'Failed to load lessons', 'SUBJECT_LESSONS_ERROR');
  }
});

module.exports = router;