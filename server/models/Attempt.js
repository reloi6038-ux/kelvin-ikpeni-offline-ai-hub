// server/models/Attempt.js
const mongoose = require('mongoose');

const attemptSchema = new mongoose.Schema(
  {
    // Anonymous learners get a client-generated UUID; registered users get ObjectId
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    anonymousId: { type: String, index: true, default: null }, // e.g. "anon_<uuid>"

    quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },

    // Answers captured offline, synced later
    answers: [
      {
        questionIndex: Number,
        selectedIndex: Number,
        isCorrect: Boolean
      }
    ],
    score: { type: Number, required: true }, // raw count
    total: { type: Number, required: true },
    percent: { type: Number, required: true },

    // Sync bookkeeping
    clientTimestamp: { type: Date, required: true }, // when the user actually took the quiz
    syncedAt:      { type: Date, default: null },
    clientId:      { type: String }, // idempotency key — index defined below

    // Context for adaptive learning
    weakTopicHints: [{ type: String }] // populated by the client after scoring
  },
  { timestamps: true }
);

attemptSchema.index({ userId: 1, quizId: 1, clientTimestamp: -1 });
attemptSchema.index({ anonymousId: 1, clientTimestamp: -1 });
attemptSchema.index({ clientId: 1 }, { unique: true, sparse: true }); // idempotency

module.exports = mongoose.model('Attempt', attemptSchema);