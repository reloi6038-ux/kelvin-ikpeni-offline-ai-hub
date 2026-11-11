// server/routes/admin.js
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');

const Subject      = require('../models/Subject');
const Lesson       = require('../models/Lesson');
const Quiz         = require('../models/Quiz');
const LearningPack = require('../models/LearningPack');
const AICache      = require('../models/AICache');
const Attempt      = require('../models/Attempt');
const Feedback     = require('../models/Feedback');

const { requireAdmin } = require('../middleware/auth');
const aiService = require('../services/aiService');
const contentImporter = require('../services/contentImporter');
const { upload } = require('../middleware/upload');
const { ok, fail, parsePagination, EDUCATION_LEVELS, CURRICULA, CONTENT_TYPES, slugify } = require('../utils/helpers');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireAdmin);

const ADMIN_WARNING = 'Prototype admin auth via X-Admin-Key. Use real authentication (JWT/session) before production.';

// ============================================================
// GET /api/admin/stats
// ============================================================
router.get('/stats', async (req, res) => {
  try {
    const [
      subjectCount, lessonCount, quizCount, packCount,
      attemptCount, feedbackOpen, aiCacheCount,
      recentAttempts, topPacks
    ] = await Promise.all([
      Subject.countDocuments({ isActive: true }),
      Lesson.countDocuments({ isPublished: true }),
      Quiz.countDocuments({ isPublished: true }),
      LearningPack.countDocuments({ isPublished: true }),
      Attempt.countDocuments({}),
      Feedback.countDocuments({ status: 'open' }),
      AICache.countDocuments({}),
      Attempt.find({}).sort({ createdAt: -1 }).limit(10)
        .select('percent clientTimestamp quizId').lean(),
      LearningPack.find({ isPublished: true }).sort({ sizeBytes: -1 }).limit(5)
        .select('name slug sizeBytes lessonCount quizCount').lean()
    ]);

    const buckets = await Attempt.aggregate([
      { $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $lt: ['$percent', 40] }, then: 'below_40' },
                { case: { $lt: ['$percent', 70] }, then: '40_to_69' },
                { case: { $gte: ['$percent', 70] }, then: '70_and_above' }
              ],
              default: 'unknown'
            }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    return res.json(ok({
      counts: { subjectCount, lessonCount, quizCount, packCount, attemptCount, feedbackOpen, aiCacheCount },
      scoreBuckets: buckets,
      recentAttempts: recentAttempts.map((a) => ({ percent: a.percent, takenAt: a.clientTimestamp })),
      topPacks: topPacks.map((p) => ({
        name: p.name, slug: p.slug, sizeKb: Math.round(p.sizeBytes / 1024),
        lessonCount: p.lessonCount, quizCount: p.quizCount
      })),
      warning: ADMIN_WARNING
    }));
  } catch (err) {
    logger.error(`GET /api/admin/stats → ${err.message}`);
    return fail(res, 500, 'Failed to load stats', 'ADMIN_STATS_ERROR');
  }
});

// ============================================================
// LESSONS — CRUD
// ============================================================

// GET /api/admin/lessons/:id
router.get('/lessons/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return fail(res, 400, 'Invalid lesson id', 'INVALID_ID');
    }
    const lesson = await Lesson.findById(req.params.id)
      .populate('subjectId', 'name slug')
      .lean();
    if (!lesson) return fail(res, 404, 'Lesson not found', 'LESSON_NOT_FOUND');
    return res.json(ok({
      id: lesson._id.toString(),
      title: lesson.title,
      summary: lesson.summary,
      content: lesson.content,
      level: lesson.level,
      curriculum: lesson.curriculum,
      contentType: lesson.contentType,
      language: lesson.language,
      order: lesson.order,
      estimatedMinutes: lesson.estimatedMinutes,
      keyPoints: lesson.keyPoints || [],
      keywords: lesson.keywords || [],
      sourceRef: lesson.sourceRef,
      isPublished: lesson.isPublished,
      subject: lesson.subjectId,
      version: lesson.version,
      updatedAt: lesson.updatedAt
    }));
  } catch (err) {
    logger.error(`GET /api/admin/lessons/:id → ${err.message}`);
    return fail(res, 500, 'Failed to load lesson', 'LESSON_FETCH_ERROR');
  }
});

// POST /api/admin/lessons
router.post('/lessons', async (req, res) => {
  try {
    const b = req.body || {};
    const validation = validateLessonPayload(b);
    if (validation) return fail(res, 400, validation, 'INVALID_PAYLOAD');

    const subject = await Subject.findOne(
      mongoose.isValidObjectId(b.subjectId) ? { _id: b.subjectId } : { slug: (b.subjectId || '').toLowerCase() }
    ).lean();
    if (!subject) return fail(res, 404, 'Subject not found', 'SUBJECT_NOT_FOUND');

    const lesson = await Lesson.create({
      subjectId: subject._id,
      title: b.title,
      summary: b.summary || '',
      content: b.content,
      level: b.level,
      curriculum: b.curriculum || 'Nigerian',
      contentType: b.contentType || 'verified_curriculum',
      language: b.language || 'en',
      order: b.order || 0,
      estimatedMinutes: b.estimatedMinutes || 10,
      keyPoints: Array.isArray(b.keyPoints) ? b.keyPoints.slice(0, 15) : [],
      keywords: Array.isArray(b.keywords) ? b.keywords.slice(0, 20) : [],
      sourceRef: b.sourceRef || '',
      isPublished: b.isPublished === true,
      slug: slugify(b.title)
    });

    await Subject.updateOne({ _id: subject._id }, { $inc: { lessonCount: 1 } });

    return res.status(201).json(ok({
      id: lesson._id.toString(),
      title: lesson.title,
      slug: lesson.slug,
      version: lesson.version,
      isPublished: lesson.isPublished
    }));
  } catch (err) {
    logger.error(`POST /api/admin/lessons → ${err.message}`);
    if (err.errors) {
      const fieldErrors = Object.keys(err.errors).reduce((acc, k) => {
        acc[k] = err.errors[k].message; return acc;
      }, {});
      return fail(res, 400, 'Validation failed', 'VALIDATION_ERROR', { fields: fieldErrors });
    }
    return fail(res, 500, 'Failed to create lesson', 'LESSON_CREATE_ERROR');
  }
});

// PATCH /api/admin/lessons/:id
router.patch('/lessons/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return fail(res, 400, 'Invalid lesson id', 'INVALID_ID');
    }
    const allowed = ['title', 'summary', 'content', 'level', 'curriculum', 'contentType',
                     'language', 'order', 'estimatedMinutes', 'keyPoints', 'keywords',
                     'sourceRef', 'isPublished'];
    const updates = {};
    for (const f of allowed) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    if (Object.keys(updates).length === 0) {
      return fail(res, 400, 'No valid updates provided', 'NO_UPDATES');
    }

    const lesson = await Lesson.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after', runValidators: true
    }).lean();
    if (!lesson) return fail(res, 404, 'Lesson not found', 'LESSON_NOT_FOUND');

    return res.json(ok({
      id: lesson._id.toString(),
      title: lesson.title,
      version: lesson.version,
      isPublished: lesson.isPublished
    }));
  } catch (err) {
    logger.error(`PATCH /api/admin/lessons/:id → ${err.message}`);
    return fail(res, 500, 'Failed to update lesson', 'LESSON_UPDATE_ERROR');
  }
});

// DELETE /api/admin/lessons/:id
router.delete('/lessons/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return fail(res, 400, 'Invalid lesson id', 'INVALID_ID');
    }
    const lesson = await Lesson.findByIdAndUpdate(
      req.params.id, { isPublished: false }, { returnDocument: 'after' }
    ).lean();
    if (!lesson) return fail(res, 404, 'Lesson not found', 'LESSON_NOT_FOUND');
    return res.json(ok({ id: lesson._id.toString(), isPublished: false }));
  } catch (err) {
    logger.error(`DELETE /api/admin/lessons/:id → ${err.message}`);
    return fail(res, 500, 'Failed to unpublish lesson', 'LESSON_DELETE_ERROR');
  }
});

// ============================================================
// IMPORT: Upload PDF/DOCX → AI extracts → preview
// POST /api/admin/lessons/import
// ============================================================
router.post('/lessons/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return fail(res, 400, 'No file uploaded', 'NO_FILE');
    }

    const b = req.body || {};
    if (!mongoose.isValidObjectId(b.subjectId)) {
      return fail(res, 400, 'subjectId is required (ObjectId)', 'INVALID_PAYLOAD');
    }

    const subject = await Subject.findById(b.subjectId).select('name').lean();
    if (!subject) return fail(res, 404, 'Subject not found', 'SUBJECT_NOT_FOUND');

    logger.info(`Importing file: ${req.file.originalname} (${req.file.size} bytes)`);

    let extracted;
    try {
      extracted = await contentImporter.extractText(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname
      );
    } catch (err) {
      return fail(res, 400, err.message, 'EXTRACT_FAILED');
    }

    if (!extracted.text || extracted.text.trim().length < 100) {
      return fail(res, 400,
        'Extracted text is too short. The PDF may be a scanned image — try a text-based PDF or .docx.',
        'TEXT_TOO_SHORT');
    }

    let structured;
    try {
      structured = await contentImporter.structureText(extracted.text, {
        subjectName: subject.name,
        level: EDUCATION_LEVELS.includes(b.level) ? b.level : 'JSS2',
        sourceRef: b.sourceRef || req.file.originalname
      });
    } catch (err) {
      logger.error(`Structuring failed: ${err.message}`);
      return fail(res, 500, 'Could not structure the content', 'STRUCTURE_FAILED');
    }

    return res.json(ok({
      preview: {
        title: structured.title,
        summary: structured.summary,
        content: structured.content,
        level: structured.level || b.level || 'JSS2',
        keyPoints: structured.keyPoints || [],
        keywords: structured.keywords || [],
        sourceRef: structured.sourceRef || b.sourceRef || req.file.originalname,
        quiz: structured.quiz || { title: '', questions: [] }
      },
      provider: structured.provider,
      rawTextLength: extracted.text.length,
      pages: extracted.pages,
      originalName: req.file.originalname,
      warning: ADMIN_WARNING
    }));
  } catch (err) {
    logger.error(`POST /api/admin/lessons/import → ${err.message}`);
    return fail(res, 500, err.message || 'Import failed', 'IMPORT_ERROR');
  }
});

// ============================================================
// APPROVE: Save a previously-previewed import
// POST /api/admin/lessons/import/approve
// ============================================================
router.post('/lessons/import/approve', async (req, res) => {
  try {
    const b = req.body || {};
    if (!mongoose.isValidObjectId(b.subjectId)) {
      return fail(res, 400, 'subjectId is required', 'INVALID_PAYLOAD');
    }
    if (!b.lesson || !b.lesson.title || !b.lesson.content) {
      return fail(res, 400, 'lesson.title and lesson.content are required', 'INVALID_PAYLOAD');
    }

    const subject = await Subject.findById(b.subjectId).lean();
    if (!subject) return fail(res, 404, 'Subject not found', 'SUBJECT_NOT_FOUND');

    const lesson = await Lesson.create({
      subjectId: subject._id,
      title: String(b.lesson.title).slice(0, 160),
      summary: String(b.lesson.summary || '').slice(0, 400),
      content: String(b.lesson.content),
      level: EDUCATION_LEVELS.includes(b.lesson.level) ? b.lesson.level : 'JSS2',
      curriculum: 'Nigerian',
      contentType: 'verified_curriculum',
      language: 'en',
      order: 0,
      estimatedMinutes: 10,
      keyPoints: Array.isArray(b.lesson.keyPoints) ? b.lesson.keyPoints.slice(0, 15).map(String) : [],
      keywords: Array.isArray(b.lesson.keywords) ? b.lesson.keywords.slice(0, 20).map(String) : [],
      sourceRef: String(b.lesson.sourceRef || '').slice(0, 200),
      isPublished: b.lesson.isPublished === true,
      slug: slugify(b.lesson.title)
    });

    await Subject.updateOne({ _id: subject._id }, { $inc: { lessonCount: 1 } });

    let quiz = null;
    if (b.quiz && Array.isArray(b.quiz.questions) && b.quiz.questions.length > 0) {
      const validQuestions = b.quiz.questions
        .filter((q) =>
          q.questionText &&
          Array.isArray(q.options) &&
          q.options.length >= 2 &&
          typeof q.correctIndex === 'number' &&
          q.correctIndex >= 0 &&
          q.correctIndex < q.options.length
        )
        .slice(0, 20);

      if (validQuestions.length > 0) {
        quiz = await Quiz.create({
          title: String(b.quiz.title || `${lesson.title} — Quiz`).slice(0, 160),
          subjectId: subject._id,
          lessonId: lesson._id,
          level: lesson.level,
          contentType: 'teacher_approved',
          passingScore: 70,
          isPublished: b.lesson.isPublished === true,
          questions: validQuestions.map((q) => ({
            questionText: String(q.questionText).slice(0, 800),
            options: q.options.slice(0, 6).map((o) => String(o).slice(0, 200)),
            correctIndex: q.correctIndex,
            explanation: String(q.explanation || '').slice(0, 800),
            difficulty: 'medium'
          }))
        });
      }
    }

    let pack = null;
    if (b.createPack === true) {
      const packSlug = `${lesson.level.toLowerCase()}-${subject.slug}-${slugify(lesson.title).slice(0, 40)}`;
      const preview = {
        lessonCount: 1,
        quizCount: quiz ? 1 : 0,
        totalQuestions: quiz ? quiz.questions.length : 0,
        estimatedMinutes: lesson.estimatedMinutes || 10
      };
      const sizeBytes = Buffer.byteLength(JSON.stringify(preview), 'utf8') + 2000;
      const contentHash = crypto.createHash('sha256').update(JSON.stringify(preview)).digest('hex');

      pack = await LearningPack.findOneAndUpdate(
        { slug: packSlug },
        {
          $set: {
            name: `${lesson.level} ${subject.name} — ${lesson.title}`,
            description: lesson.summary || '',
            subjectId: subject._id,
            level: lesson.level,
            curriculum: 'Nigerian',
            language: 'en',
            lessonIds: [lesson._id],
            quizIds: quiz ? [quiz._id] : [],
            lessonCount: 1,
            quizCount: quiz ? 1 : 0,
            estimatedMinutes: lesson.estimatedMinutes || 10,
            sizeBytes,
            contentHash,
            checksum: contentHash,
            isPublished: lesson.isPublished,
            offlineReady: true
          },
          $setOnInsert: { slug: packSlug, version: 1 }
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );

      await Lesson.updateOne({ _id: lesson._id }, { $addToSet: { packIds: pack._id } });
    }

    return res.status(201).json(ok({
      lesson: {
        id: lesson._id.toString(),
        title: lesson.title,
        level: lesson.level,
        isPublished: lesson.isPublished
      },
      quiz: quiz ? {
        id: quiz._id.toString(),
        title: quiz.title,
        questionCount: quiz.questions.length
      } : null,
      pack: pack ? {
        id: pack._id.toString(),
        slug: pack.slug,
        name: pack.name
      } : null
    }));
  } catch (err) {
    logger.error(`POST /api/admin/lessons/import/approve → ${err.message}`);
    if (err.errors) {
      const fieldErrors = Object.keys(err.errors).reduce((acc, k) => {
        acc[k] = err.errors[k].message; return acc;
      }, {});
      return fail(res, 400, 'Validation failed', 'VALIDATION_ERROR', { fields: fieldErrors });
    }
    return fail(res, 500, 'Save failed', 'IMPORT_SAVE_ERROR');
  }
});

// ============================================================
// AI warm
// ============================================================
router.post('/ai/warm', async (req, res) => {
  try {
    const b = req.body || {};
    if (!mongoose.isValidObjectId(b.lessonId)) {
      return fail(res, 400, 'Invalid lessonId', 'INVALID_PAYLOAD');
    }
    const actions = Array.isArray(b.actions) && b.actions.length > 0
      ? b.actions.filter((a) => ['explain_simply', 'give_examples', 'practice_questions', 'summarize'].includes(a))
      : ['explain_simply', 'give_examples', 'practice_questions', 'summarize'];
    const learningDifficulty = ['beginner', 'intermediate', 'advanced'].includes(b.difficulty)
      ? b.difficulty : 'beginner';
    const language = ['en', 'pidgin', 'ha', 'ig', 'yo'].includes(b.language) ? b.language : 'en';

    const results = [];
    for (const action of actions) {
      const r = await aiService.getAIResponse({ lessonId: b.lessonId, action, learningDifficulty, language });
      results.push({
        action, ok: r.ok,
        provider: r.ok ? r.response.provider : null,
        source: r.ok ? r.response.source : null,
        error: r.ok ? null : r.code
      });
    }

    return res.json(ok({ lessonId: b.lessonId, results, warning: ADMIN_WARNING }));
  } catch (err) {
    logger.error(`POST /api/admin/ai/warm → ${err.message}`);
    return fail(res, 500, 'AI warm-up failed', 'AI_WARM_ERROR');
  }
});

// ============================================================
// PACKS
// ============================================================
router.post('/packs/build', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.slug || typeof b.slug !== 'string') return fail(res, 400, 'slug is required', 'INVALID_PAYLOAD');
    if (!b.name || typeof b.name !== 'string') return fail(res, 400, 'name is required', 'INVALID_PAYLOAD');
    if (!Array.isArray(b.lessonIds) || b.lessonIds.length === 0) {
      return fail(res, 400, 'lessonIds must be a non-empty array', 'INVALID_PAYLOAD');
    }

    const subjectQuery = mongoose.isValidObjectId(b.subjectId)
      ? { _id: b.subjectId } : { slug: (b.subjectId || '').toLowerCase() };
    const subject = await Subject.findOne(subjectQuery).lean();
    if (!subject) return fail(res, 404, 'Subject not found', 'SUBJECT_NOT_FOUND');

    const lessons = await Lesson.find({ _id: { $in: b.lessonIds }, isPublished: true }).lean();
    if (lessons.length === 0) return fail(res, 400, 'No published lessons in lessonIds', 'NO_LESSONS');

    const quizzes = Array.isArray(b.quizIds)
      ? await Quiz.find({ _id: { $in: b.quizIds }, isPublished: true }).lean()
      : [];

    const preview = {
      format: 'kelvin-pack-v1',
      slug: b.slug,
      name: b.name,
      lessonIds: lessons.map((l) => l._id.toString()),
      quizIds: quizzes.map((q) => q._id.toString()),
      lessonCount: lessons.length,
      quizCount: quizzes.length,
      totalQuestions: quizzes.reduce((s, q) => s + q.questions.length, 0),
      estimatedMinutes: lessons.reduce((s, l) => s + (l.estimatedMinutes || 10), 0),
      language: b.language || 'en',
      level: b.level,
      curriculum: b.curriculum || 'Nigerian'
    };
    const sizeBytes = Buffer.byteLength(JSON.stringify(preview), 'utf8');
    const contentHash = crypto.createHash('sha256').update(JSON.stringify(preview)).digest('hex');

    const existing = await LearningPack.findOne({ slug: b.slug }).lean();
    const nextVersion = existing ? (existing.version || 0) + 1 : 1;

    const pack = await LearningPack.findOneAndUpdate(
      { slug: b.slug },
      {
        name: b.name,
        slug: b.slug,
        description: b.description || (existing ? existing.description : ''),
        subjectId: subject._id,
        level: b.level || 'JSS2',
        curriculum: b.curriculum || 'Nigerian',
        language: b.language || 'en',
        lessonIds: lessons.map((l) => l._id),
        quizIds: quizzes.map((q) => q._id),
        lessonCount: lessons.length,
        quizCount: quizzes.length,
        estimatedMinutes: preview.estimatedMinutes,
        sizeBytes,
        version: nextVersion,
        contentHash,
        checksum: contentHash,
        isPublished: b.isPublished === true,
        offlineReady: true
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();

    await Lesson.updateMany(
      { _id: { $in: lessons.map((l) => l._id) } },
      { $addToSet: { packIds: pack._id } }
    );

    return res.json(ok({
      id: pack._id.toString(),
      slug: pack.slug,
      version: pack.version,
      sizeBytes: pack.sizeBytes,
      contentHash: pack.contentHash,
      lessonCount: pack.lessonCount,
      quizCount: pack.quizCount,
      isPublished: pack.isPublished,
      warning: ADMIN_WARNING
    }));
  } catch (err) {
    logger.error(`POST /api/admin/packs/build → ${err.message}`);
    return fail(res, 500, 'Pack build failed', 'PACK_BUILD_ERROR');
  }
});

router.get('/packs', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const [items, total] = await Promise.all([
      LearningPack.find({}).sort({ updatedAt: -1 }).skip(skip).limit(limit)
        .populate('subjectId', 'name slug').lean(),
      LearningPack.countDocuments({})
    ]);
    return res.json(ok(items.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      slug: p.slug,
      subject: p.subjectId,
      level: p.level,
      version: p.version,
      sizeBytes: p.sizeBytes,
      lessonCount: p.lessonCount,
      quizCount: p.quizCount,
      isPublished: p.isPublished,
      updatedAt: p.updatedAt
    })), { page, limit, total, pages: Math.ceil(total / limit) }));
  } catch (err) {
    logger.error(`GET /api/admin/packs → ${err.message}`);
    return fail(res, 500, 'Failed to load packs', 'ADMIN_PACKS_ERROR');
  }
});

router.delete('/packs/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return fail(res, 400, 'Invalid id', 'INVALID_ID');
    }
    const updated = await LearningPack.findByIdAndUpdate(
      req.params.id, { isPublished: false }, { returnDocument: 'after' }
    ).lean();
    if (!updated) return fail(res, 404, 'Pack not found', 'PACK_NOT_FOUND');
    return res.json(ok({ id: updated._id.toString(), isPublished: false }));
  } catch (err) {
    logger.error(`DELETE /api/admin/packs/:id → ${err.message}`);
    return fail(res, 500, 'Failed to unpublish pack', 'ADMIN_PACK_DELETE_ERROR');
  }
});

// ============================================================
// Attempts feed
// ============================================================
router.get('/attempts', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const [items, total] = await Promise.all([
      Attempt.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .select('percent score total clientTimestamp quizId').lean(),
      Attempt.countDocuments({})
    ]);
    return res.json(ok(items.map((a) => ({
      percent: a.percent,
      score: a.score,
      total: a.total,
      takenAt: a.clientTimestamp,
      quizId: a.quizId ? a.quizId.toString() : null
    })), { page, limit, total, pages: Math.ceil(total / limit) }));
  } catch (err) {
    logger.error(`GET /api/admin/attempts → ${err.message}`);
    return fail(res, 500, 'Failed to load attempts', 'ADMIN_ATTEMPTS_ERROR');
  }
});

// ============================================================
// QUIZZES — CRUD
// ============================================================
router.get('/quizzes', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    if (req.query.subject && mongoose.isValidObjectId(req.query.subject)) {
      filter.subjectId = req.query.subject;
    }
    if (req.query.lesson && mongoose.isValidObjectId(req.query.lesson)) {
      filter.lessonId = req.query.lesson;
    }
    const [items, total] = await Promise.all([
      Quiz.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .populate('subjectId', 'name slug').lean(),
      Quiz.countDocuments(filter)
    ]);
    return res.json(ok(items.map(q => ({
      id: q._id.toString(),
      title: q.title,
      subject: q.subjectId,
      lessonId: q.lessonId ? q.lessonId.toString() : null,
      level: q.level,
      questionCount: q.questions.length,
      passingScore: q.passingScore,
      isPublished: q.isPublished,
      createdAt: q.createdAt
    })), { page, limit, total, pages: Math.ceil(total / limit) }));
  } catch (err) {
    logger.error(`GET /api/admin/quizzes → ${err.message}`);
    return fail(res, 500, 'Failed to load quizzes', 'ADMIN_QUIZZES_ERROR');
  }
});

router.get('/quizzes/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return fail(res, 400, 'Invalid quiz id', 'INVALID_ID');
    }
    const quiz = await Quiz.findById(req.params.id)
      .populate('subjectId', 'name slug')
      .lean();
    if (!quiz) return fail(res, 404, 'Quiz not found', 'QUIZ_NOT_FOUND');
    return res.json(ok({
      id: quiz._id.toString(),
      title: quiz.title,
      lessonId: quiz.lessonId ? quiz.lessonId.toString() : null,
      level: quiz.level,
      contentType: quiz.contentType,
      passingScore: quiz.passingScore,
      timeLimitMinutes: quiz.timeLimitMinutes,
      questions: quiz.questions.map(q => ({
        questionText: q.questionText,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation || '',
        difficulty: q.difficulty
      })),
      isPublished: quiz.isPublished,
      subject: quiz.subjectId,
      updatedAt: quiz.updatedAt
    }));
  } catch (err) {
    logger.error(`GET /api/admin/quizzes/:id → ${err.message}`);
    return fail(res, 500, 'Failed to load quiz', 'QUIZ_FETCH_ERROR');
  }
});

router.post('/quizzes', async (req, res) => {
  try {
    const b = req.body || {};
    if (!mongoose.isValidObjectId(b.subjectId)) {
      return fail(res, 400, 'subjectId must be a valid ObjectId', 'INVALID_PAYLOAD');
    }
    if (!b.title || typeof b.title !== 'string') {
      return fail(res, 400, 'title is required', 'INVALID_PAYLOAD');
    }
    if (!Array.isArray(b.questions) || b.questions.length === 0) {
      return fail(res, 400, 'questions must be a non-empty array', 'INVALID_PAYLOAD');
    }
    if (!EDUCATION_LEVELS.includes(b.level)) {
      return fail(res, 400, `level must be one of: ${EDUCATION_LEVELS.join(', ')}`, 'INVALID_PAYLOAD');
    }

    for (let i = 0; i < b.questions.length; i++) {
      const q = b.questions[i];
      if (!q.questionText || typeof q.questionText !== 'string') {
        return fail(res, 400, `Question ${i + 1} is missing questionText`, 'INVALID_PAYLOAD');
      }
      if (!Array.isArray(q.options) || q.options.length < 2) {
        return fail(res, 400, `Question ${i + 1} needs at least 2 options`, 'INVALID_PAYLOAD');
      }
      if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
        return fail(res, 400, `Question ${i + 1} has invalid correctIndex`, 'INVALID_PAYLOAD');
      }
    }

    const quiz = await Quiz.create({
      title: b.title,
      subjectId: b.subjectId,
      lessonId: b.lessonId && mongoose.isValidObjectId(b.lessonId) ? b.lessonId : null,
      level: b.level,
      contentType: b.contentType || 'teacher_approved',
      passingScore: typeof b.passingScore === 'number' ? b.passingScore : 70,
      timeLimitMinutes: typeof b.timeLimitMinutes === 'number' ? b.timeLimitMinutes : 0,
      questions: b.questions.map(q => ({
        questionText: q.questionText,
        options: q.options.slice(0, 6),
        correctIndex: q.correctIndex,
        explanation: q.explanation || '',
        difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium'
      })),
      isPublished: b.isPublished === true
    });

    return res.status(201).json(ok({
      id: quiz._id.toString(),
      title: quiz.title,
      questionCount: quiz.questions.length,
      isPublished: quiz.isPublished
    }));
  } catch (err) {
    logger.error(`POST /api/admin/quizzes → ${err.message}`);
    if (err.errors) {
      const fieldErrors = Object.keys(err.errors).reduce((acc, k) => {
        acc[k] = err.errors[k].message; return acc;
      }, {});
      return fail(res, 400, 'Validation failed', 'VALIDATION_ERROR', { fields: fieldErrors });
    }
    return fail(res, 500, 'Failed to create quiz', 'QUIZ_CREATE_ERROR');
  }
});

router.patch('/quizzes/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return fail(res, 400, 'Invalid quiz id', 'INVALID_ID');
    }
    const allowed = ['title', 'lessonId', 'level', 'contentType', 'passingScore',
                     'timeLimitMinutes', 'questions', 'isPublished'];
    const updates = {};
    for (const f of allowed) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    if (Object.keys(updates).length === 0) {
      return fail(res, 400, 'No valid updates', 'NO_UPDATES');
    }
    const quiz = await Quiz.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after', runValidators: true
    }).lean();
    if (!quiz) return fail(res, 404, 'Quiz not found', 'QUIZ_NOT_FOUND');
    return res.json(ok({
      id: quiz._id.toString(),
      title: quiz.title,
      questionCount: quiz.questions.length,
      isPublished: quiz.isPublished
    }));
  } catch (err) {
    logger.error(`PATCH /api/admin/quizzes/:id → ${err.message}`);
    return fail(res, 500, 'Failed to update quiz', 'QUIZ_UPDATE_ERROR');
  }
});

router.delete('/quizzes/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return fail(res, 400, 'Invalid quiz id', 'INVALID_ID');
    }
    const quiz = await Quiz.findByIdAndUpdate(
      req.params.id, { isPublished: false }, { returnDocument: 'after' }
    ).lean();
    if (!quiz) return fail(res, 404, 'Quiz not found', 'QUIZ_NOT_FOUND');
    return res.json(ok({ id: quiz._id.toString(), isPublished: false }));
  } catch (err) {
    logger.error(`DELETE /api/admin/quizzes/:id → ${err.message}`);
    return fail(res, 500, 'Failed to unpublish quiz', 'QUIZ_DELETE_ERROR');
  }
});

// ============================================================
// SUBJECTS — create
// ============================================================
router.post('/subjects', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || typeof b.name !== 'string') {
      return fail(res, 400, 'name is required', 'INVALID_PAYLOAD');
    }
    const slug = b.slug || slugify(b.name);
    const existing = await Subject.findOne({ $or: [{ name: b.name }, { slug }] }).lean();
    if (existing) {
      return fail(res, 409, 'A subject with this name or slug already exists', 'DUPLICATE_SUBJECT');
    }
    const subject = await Subject.create({
      name: b.name,
      slug,
      curriculum: b.curriculum || 'Nigerian',
      levels: Array.isArray(b.levels) && b.levels.length > 0 ? b.levels : ['JSS1', 'JSS2', 'JSS3'],
      description: b.description || '',
      icon: b.icon || '📘',
      color: b.color || '#2563eb',
      isActive: true
    });
    return res.status(201).json(ok({
      id: subject._id.toString(),
      name: subject.name,
      slug: subject.slug
    }));
  } catch (err) {
    logger.error(`POST /api/admin/subjects → ${err.message}`);
    return fail(res, 500, 'Failed to create subject', 'SUBJECT_CREATE_ERROR');
  }
});

// ============================================================
// Helpers
// ============================================================
function validateLessonPayload(b) {
  if (!b.subjectId) return 'subjectId is required';
  if (!b.title || typeof b.title !== 'string') return 'title is required';
  if (!b.content || typeof b.content !== 'string') return 'content is required';
  if (b.content.length > 50000) return 'content exceeds 50000 characters';
  if (!EDUCATION_LEVELS.includes(b.level)) return `level must be one of: ${EDUCATION_LEVELS.join(', ')}`;
  if (b.curriculum && !CURRICULA.includes(b.curriculum)) return `curriculum must be one of: ${CURRICULA.join(', ')}`;
  if (b.contentType && !CONTENT_TYPES.includes(b.contentType)) return `contentType must be one of: ${CONTENT_TYPES.join(', ')}`;
  if (b.keyPoints && !Array.isArray(b.keyPoints)) return 'keyPoints must be an array';
  if (b.keywords && !Array.isArray(b.keywords)) return 'keywords must be an array';
  return null;
}

module.exports = router;