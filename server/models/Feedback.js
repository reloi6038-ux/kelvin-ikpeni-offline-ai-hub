// server/models/Feedback.js
const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    anonymousId: { type: String, default: null },

    type: {
      type: String,
      enum: ['ai_incorrect', 'content_outdated', 'broken_lesson', 'technical', 'other'],
      required: true,
      index: true
    },
    message: { type: String, required: true, maxlength: 2000 },
    relatedLessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
    relatedQuizId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
    relatedPackId:   { type: mongoose.Schema.Types.ObjectId, ref: 'LearningPack' },

    // Context snapshot (never include PII)
    pageUrl: { type: String, maxlength: 300 },
    deviceInfo: { type: String, maxlength: 200 }, // UA string, truncated

    status: {
      type: String,
      enum: ['open', 'reviewing', 'resolved', 'dismissed'],
      default: 'open',
      index: true
    },
    adminNote: { type: String, maxlength: 1000, default: '' },
    resolvedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

feedbackSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);