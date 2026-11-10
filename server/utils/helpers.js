// server/utils/helpers.js

const EDUCATION_LEVELS = [
  'Primary 4', 'Primary 5', 'Primary 6',
  'JSS1', 'JSS2', 'JSS3',
  'SS1', 'SS2', 'SS3'
];

const CURRICULA = ['Nigerian', 'WAEC', 'NECO', 'IGCSE', 'Custom'];

const CONTENT_TYPES = ['verified_curriculum', 'teacher_approved', 'ai_generated'];

const SYNC_ACTIONS = [
  'quiz_attempt', 'progress_update', 'feedback_create', 'download_record'
];

const LANGUAGE_CODES = ['en', 'pidgin', 'ha', 'ig', 'yo'];

// Simple slug for human URLs — no deps
function slugify(text = '') {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = {
  EDUCATION_LEVELS,
  CURRICULA,
  CONTENT_TYPES,
  SYNC_ACTIONS,
  LANGUAGE_CODES,
  slugify
};


// server/utils/helpers.js  (append these to your existing exports)

/**
 * Parse ?page & ?limit from a query object with safe bounds.
 */
function parsePagination(query, { defaultLimit = 20, maxLimit = 50 } = {}) {
  const page  = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Parse ?fields=a,b,c into a safe Mongoose projection object.
 * Only allow fields that the client is permitted to select.
 */
function parseFields(query, allowed = []) {
  if (!query.fields || allowed.length === 0) return null;
  const requested = query.fields.split(',').map((f) => f.trim()).filter(Boolean);
  const projection = {};
  for (const f of requested) {
    if (allowed.includes(f)) projection[f] = 1;
  }
  return Object.keys(projection).length ? projection : null;
}

/**
 * Consistent success envelope.
 */
function ok(data, meta = {}) {
  return { data, meta };
}

/**
 * Consistent error envelope.
 */
function fail(res, status, message, code = 'ERROR', extra = {}) {
  return res.status(status).json({ error: message, code, ...extra });
}

module.exports.parsePagination = parsePagination;
module.exports.parseFields = parseFields;
module.exports.ok = ok;
module.exports.fail = fail;