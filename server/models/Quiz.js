// server/models/Quiz.js
const mongoose = require('mongoose');
const { EDUCATION_LEVELS, CONTENT_TYPES } = require('../utils/helpers');

const questionSchema = new mongoose.Schema(
  {
    questionText: { type: String, required: true, maxlength: 800 },
    options: {
      type: [String],
      required: true,
      validate: {
        validator: (arr) => arr.length >= 2 && arr.length <= 6,
        message: 'A question must have 2–6 options'
      }
    },
    correctIndex: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: function (v) { return v < this.options.length; },
        message: 'correctIndex out of range'
      }
    },
    explanation: { type: String, maxlength: 800, default: '' },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' }
  },
  { _id: true }
);

const quizSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
      index: true
    },
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      index: true
    },
    level: { type: String, enum: EDUCATION_LEVELS, required: true, index: true },
    contentType: {
      type: String,
      enum: CONTENT_TYPES,
      default: 'teacher_approved'
    },
    questions: {
      type: [questionSchema],
      validate: {
        validator: (arr) => arr.length > 0 && arr.length <= 50,
        message: 'A quiz must have between 1 and 50 questions'
      }
    },
    passingScore: { type: Number, default: 70, min: 0, max: 100 }, // percent
    timeLimitMinutes: { type: Number, default: 0 }, // 0 = untimed
    isPublished: { type: Boolean, default: false, index: true }
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

quizSchema.index({ subjectId: 1, level: 1, isPublished: 1 });

module.exports = mongoose.model('Quiz', quizSchema);