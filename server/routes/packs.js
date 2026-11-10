// server/routes/packs.js
const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');

const LearningPack = require('../models/LearningPack');
const Lesson       = require('../models/Lesson');
const Quiz         = require('../models/Quiz');
const AICache      = require('../models/AICache');
const Subject      = require('../models/Subject');
const { ok, fail, parsePagination, parseFields } = require('../utils/helpers');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================================
// GET /api/packs — Download Center listing
// ============================================================
router.get('/', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { isPublished: true };

    if (req.query.subject) {
      if (mongoose.isValidObjectId(req.query.subject)) {
        filter.subjectId = req.query.subject;
      } else {
        const subj = await Subject.findOne({ slug: req.query.subject.toLowerCase() }).select('_id').lean();
        if (!subj) return fail(res, 404, 'Subject not found', 'SUBJECT_NOT_FOUND');
        filter.subjectId = subj._id;
      }
    }
    if (req.query.level)      filter.level = req.query.level;
    if (req.query.curriculum) filter.curriculum = req.query.curriculum;

    // Sort by name by default; allow ?sort=size|recent
    const sortMap = {
      size:   { sizeBytes: 1 },
      recent: { updatedAt: -1 },
      name:   { name: 1 }
    };
    const sort = sortMap[req.query.sort] || { name: 1 };

    const projection = parseFields(req.query, [
      'name', 'slug', 'description', 'level', 'curriculum', 'language',
      'sizeBytes', 'lessonCount', 'quizCount', 'estimatedMinutes',
      'version', 'updatedAt'
    ]);

    const [items, total] = await Promise.all([
      LearningPack.find(filter, projection)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('subjectId', 'name slug icon color')
        .lean(),
      LearningPack.countDocuments(filter)
    ]);

    // Shape for the frontend
    const shaped = items.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      slug: p.slug,
      description: p.description,
      level: p.level,
      curriculum: p.curriculum,
      language: p.language,
      subject: p.subjectId,
      sizeBytes: p.sizeBytes,
      sizeLabel: formatBytes(p.sizeBytes),
      lessonCount: p.lessonCount,
      quizCount: p.quizCount,
      estimatedMinutes: p.estimatedMinutes,
      version: p.version,
      updatedAt: p.updatedAt
    }));

    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    return res.json(ok(shaped, { page, limit, total, pages: Math.ceil(total / limit) }));
  } catch (err) {
    logger.error(`GET /api/packs → ${err.message}`);
    return fail(res, 500, 'Failed to load packs', 'PACKS_LIST_ERROR');
  }
});

// ============================================================
// GET /api/packs/:idOrSlug — Pack metadata (no download)
// ============================================================
router.get('/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const query = mongoose.isValidObjectId(idOrSlug)
      ? { _id: idOrSlug }
      : { slug: idOrSlug.toLowerCase() };

    const pack = await LearningPack.findOne({ ...query, isPublished: true })
      .populate('subjectId', 'name slug icon color')
      .lean();

    if (!pack) return fail(res, 404, 'Pack not found', 'PACK_NOT_FOUND');

    res.set('Cache-Control', 'public, max-age=300');
    return res.json(ok({
      id: pack._id.toString(),
      name: pack.name,
      slug: pack.slug,
      description: pack.description,
      level: pack.level,
      curriculum: pack.curriculum,
      language: pack.language,
      subject: pack.subjectId,
      sizeBytes: pack.sizeBytes,
      sizeLabel: formatBytes(pack.sizeBytes),
      lessonCount: pack.lessonCount,
      quizCount: pack.quizCount,
      estimatedMinutes: pack.estimatedMinutes,
      version: pack.version,
      contentHash: pack.contentHash,
      checksum: pack.checksum,
      offlineReady: pack.offlineReady,
      updatedAt: pack.updatedAt
    }));
  } catch (err) {
    logger.error(`GET /api/packs/:id → ${err.message}`);
    return fail(res, 500, 'Failed to load pack', 'PACK_FETCH_ERROR');
  }
});

// ============================================================
// GET /api/packs/:idOrSlug/download — THE OFFLINE BUNDLE
// ============================================================
router.get('/:idOrSlug/download', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const query = mongoose.isValidObjectId(idOrSlug)
      ? { _id: idOrSlug }
      : { slug: idOrSlug.toLowerCase() };

    const pack = await LearningPack.findOne({ ...query, isPublished: true }).lean();
    if (!pack) return fail(res, 404, 'Pack not found', 'PACK_NOT_FOUND');

    // Fetch everything in parallel
    const [lessons, quizzes, aiCacheEntries, subject] = await Promise.all([
      Lesson.find({ _id: { $in: pack.lessonIds }, isPublished: true })
        .select('title slug summary content level curriculum contentType language ' +
                'order estimatedMinutes keyPoints keywords sourceRef version')
        .lean(),
      Quiz.find({ _id: { $in: pack.quizIds }, isPublished: true })
        .select('title lessonId level contentType questions passingScore timeLimitMinutes')
        .lean(),
      AICache.find({
        lessonId: { $in: pack.lessonIds },
        language: pack.language || 'en'
      })
        .select('lessonId action learningDifficulty content groundedIn confidence lessonVersion')
        .lean(),
      // NOTE: `-_id` excludes the ObjectId (which would serialize as an ugly Buffer object)
      Subject.findById(pack.subjectId).select('name slug icon color -_id').lean()
    ]);

    // Sort lessons by order (client displays them in sequence)
    lessons.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Group AI cache by lessonId → action → { content, ... }
    const aiByLesson = {};
    for (const entry of aiCacheEntries) {
      const key = entry.lessonId.toString();
      if (!aiByLesson[key]) aiByLesson[key] = {};
      aiByLesson[key][entry.action] = {
        content: entry.content,
        groundedIn: entry.groundedIn,
        confidence: entry.confidence,
        difficulty: entry.learningDifficulty,
        isVerified: false
      };
    }

    // Build the payload
    const payload = {
      // --- Metadata ---
      format: 'kelvin-pack-v1',
      packId: pack._id.toString(),
      name: pack.name,
      slug: pack.slug,
      version: pack.version,
      language: pack.language,
      level: pack.level,
      curriculum: pack.curriculum,
      subject: subject || null,

      // --- Content ---
      lessons: lessons.map((l) => ({
        id: l._id.toString(),
        title: l.title,
        slug: l.slug,
        summary: l.summary,
        content: l.content,
        level: l.level,
        curriculum: l.curriculum,
        contentType: l.contentType,
        language: l.language,
        order: l.order,
        estimatedMinutes: l.estimatedMinutes,
        keyPoints: l.keyPoints || [],
        keywords: l.keywords || [],
        sourceRef: l.sourceRef,
        version: l.version,
        ai: aiByLesson[l._id.toString()] || {}
      })),

      quizzes: quizzes.map((q) => ({
        id: q._id.toString(),
        title: q.title,
        lessonId: q.lessonId ? q.lessonId.toString() : null,
        level: q.level,
        contentType: q.contentType,
        passingScore: q.passingScore,
        timeLimitMinutes: q.timeLimitMinutes,
        questions: q.questions.map((qq) => ({
          questionText: qq.questionText,
          options: qq.options,
          correctIndex: qq.correctIndex,
          explanation: qq.explanation,
          difficulty: qq.difficulty
        }))
      })),

      // --- Manifest for client bookkeeping ---
      manifest: {
        generatedAt: new Date().toISOString(),
        lessonCount: lessons.length,
        quizCount: quizzes.length,
        aiEntryCount: aiCacheEntries.length,
        totalQuestions: quizzes.reduce((sum, q) => sum + q.questions.length, 0)
      }
    };

    // ---------------------------------------------------------
    // Checksum fix (the critical change):
    //
    // Compute the checksum over the payload WITHOUT the checksum
    // field first — this makes the hash reproducible regardless
    // of the checksum value itself.
    //
    // Then inject the checksum into the manifest and RE-STRINGIFY
    // so the sent body includes it. This is what lets the client
    // verify the body against the X-Pack-Checksum header.
    // ---------------------------------------------------------
    const payloadJsonBase = stableStringify(payload);
    const checksum = crypto.createHash('sha256').update(payloadJsonBase).digest('hex');

    payload.manifest.checksum = checksum;
    const payloadJson = stableStringify(payload);

    // ---- Cache-Control: packs are versioned, so let browsers hold them ----
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=600');
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set(
      'Content-Disposition',
      `attachment; filename="${pack.slug || 'learning-pack'}-v${pack.version}.json"`
    );
    res.set('X-Pack-Version', String(pack.version));
    res.set('X-Pack-Checksum', checksum);

    // compression middleware handles gzip
    return res.send(payloadJson);
  } catch (err) {
    logger.error(`GET /api/packs/:id/download → ${err.message}`);
    return fail(res, 500, 'Failed to build pack', 'PACK_DOWNLOAD_ERROR');
  }
});

// ============================================================
// Helpers
// ============================================================

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Deterministic JSON.stringify that sorts keys.
 * Ensures the checksum is stable across Node versions and object key orders.
 */
function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

module.exports = router;