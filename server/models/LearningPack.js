// server/models/LearningPack.js
const mongoose = require('mongoose');
const { EDUCATION_LEVELS, CURRICULA } = require('../utils/helpers');

const learningPackSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    slug: { type: String, unique: true, lowercase: true, index: true },
    description: { type: String, maxlength: 500, default: '' },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
      index: true
    },
    level: { type: String, enum: EDUCATION_LEVELS, required: true, index: true },
    curriculum: { type: String, enum: CURRICULA, default: 'Nigerian' },
    language: { type: String, default: 'en' },

    // Composition
    lessonIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }],
    quizIds:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' }],

    // Metadata for the Download Center UI
    sizeBytes: { type: Number, default: 0 }, // computed at build time
    lessonCount: { type: Number, default: 0 },
    quizCount: { type: Number, default: 0 },
    estimatedMinutes: { type: Number, default: 0 },

    // Versioning — client compares to detect "Update Available"
    version: { type: Number, default: 1 },
    contentHash: { type: String, default: '' }, // sha256 of payload

    // Access
    isPublished: { type: Boolean, default: false, index: true },
    offlineReady: { type: Boolean, default: true },

    // Integrity — client checks this to reject corrupted downloads
    checksum: { type: String, default: '' },

    // Audit
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
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

learningPackSchema.index({ subjectId: 1, level: 1, isPublished: 1 });

module.exports = mongoose.model('LearningPack', learningPackSchema);