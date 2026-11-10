// server/models/AICache.js
const mongoose = require('mongoose');

const ACTIONS = [
  'explain_simply',
  'give_examples',
  'practice_questions',
  'summarize',
  'explain_mistake',
  'revision_notes'
];

const aiCacheSchema = new mongoose.Schema(
  {
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: true,
      index: true
    },
    action: {
      type: String,
      enum: ACTIONS,
      required: true,
      index: true
    },
    learningDifficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner'
    },
    language: { type: String, default: 'en', enum: ['en', 'pidgin', 'ha', 'ig', 'yo'] },

    content: { type: String, required: true, maxlength: 8000 },
    provider: { type: String, default: 'template' }, // 'gemini', 'openai', 'template'
    model:    { type: String, default: null },
    tokensUsed: { type: Number, default: 0 },

    // Grounding and safety
    groundedIn: { type: String, default: '' }, // sourceRef from the lesson
    confidence: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    isVerified: { type: Boolean, default: false },

    // Versioning — regenerate when lesson content changes
    lessonVersion: { type: Number, required: true }
  },
  { timestamps: true }
);

// One cache entry per (lesson, action, difficulty, language, lessonVersion)
aiCacheSchema.index(
  { lessonId: 1, action: 1, learningDifficulty: 1, language: 1, lessonVersion: 1 },
  { unique: true }
);

aiCacheSchema.statics.ACTIONS = ACTIONS;

module.exports = mongoose.model('AICache', aiCacheSchema);