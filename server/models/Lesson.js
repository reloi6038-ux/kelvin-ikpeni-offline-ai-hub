// server/models/Lesson.js
const mongoose = require('mongoose');
const { EDUCATION_LEVELS, CURRICULA, CONTENT_TYPES } = require('../utils/helpers');

const lessonSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Lesson title is required'],
      trim: true,
      maxlength: 160
    },
    slug: { type: String, index: true },
    summary: { type: String, maxlength: 400, default: '' },
    content: {
      type: String,
      required: [true, 'Lesson content is required'],
      maxlength: 50000 // ~50KB cap keeps packs small
    },
    level: {
      type: String,
      enum: EDUCATION_LEVELS,
      required: true,
      index: true
    },
    curriculum: {
      type: String,
      enum: CURRICULA,
      default: 'Nigerian',
      index: true
    },
    contentType: {
      type: String,
      enum: CONTENT_TYPES,
      default: 'verified_curriculum',
      index: true
    },
    language: { type: String, default: 'en', enum: ['en', 'pidgin', 'ha', 'ig', 'yo'] },
    order: { type: Number, default: 0 },
    estimatedMinutes: { type: Number, default: 10, min: 1, max: 240 },
    keyPoints: [{ type: String, maxlength: 200 }], // used by offline AI fallback
    keywords: [{ type: String, maxlength: 40 }],   // used by offline search
    sourceRef: { type: String, default: '' },      // "JSS2 Mathematics, Ch. 3"
    isPublished: { type: Boolean, default: false, index: true },
    packIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'LearningPack' }
    ],
    version: { type: Number, default: 1 }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

lessonSchema.index({ subjectId: 1, level: 1, order: 1 });
lessonSchema.index({ title: 'text', content: 'text', keywords: 'text' });

// Bump version whenever critical content changes
lessonSchema.pre('save', function () {
  if (!this.isNew && this.isModified('content')) {
    this.version += 1;
  }
});

module.exports = mongoose.model('Lesson', lessonSchema);