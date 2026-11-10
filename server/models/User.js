// server/models/User.js
const mongoose = require('mongoose');
const { EDUCATION_LEVELS } = require('../utils/helpers');

const userSchema = new mongoose.Schema(
  {
    // Minimal PII — only what's required. Students can stay anonymous.
    name: { type: String, trim: true, maxlength: 80, default: '' },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true, // allows anonymous/teacher accounts without email
      match: [/^\S+@\S+\.\S+$/, 'Invalid email']
    },
    passwordHash: { type: String, select: false }, // never returned by default

    role: {
      type: String,
      enum: ['student', 'teacher', 'admin'],
      default: 'student',
      index: true
    },

    // Learning profile — drives the AI tutor and adaptive content
    educationLevel: { type: String, enum: EDUCATION_LEVELS, default: 'JSS2' },
    preferredLanguage: { type: String, default: 'en', enum: ['en', 'pidgin', 'ha', 'ig', 'yo'] },
    subjectsOfInterest: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
    learningDifficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner'
    },
    learningFormat: {
      type: String,
      enum: ['text', 'simplified', 'examples', 'audio_ready'],
      default: 'simplified'
    },

    // Preferences for the client-side app
    preferences: {
      dataSaverMode:   { type: Boolean, default: false },
      textOnlyMode:    { type: Boolean, default: false },
      reduceMotion:    { type: Boolean, default: false },
      ttsEnabled:      { type: Boolean, default: false }
    },

    // Lightweight learning stats (recomputed from attempts periodically)
    stats: {
      totalAttempts: { type: Number, default: 0 },
      averageScore:  { type: Number, default: 0 },
      streakDays:    { type: Number, default: 0 },
      lastActiveAt:  { type: Date, default: null }
    },

    isActive: { type: Boolean, default: true }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash; // belt-and-braces
        return ret;
      }
    }
  }
);

userSchema.index({ role: 1, isActive: 1 });

module.exports = mongoose.model('User', userSchema);