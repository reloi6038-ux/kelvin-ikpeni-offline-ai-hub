// server/models/SyncQueue.js
const mongoose = require('mongoose');
const { SYNC_ACTIONS } = require('../utils/helpers');

const syncQueueSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    anonymousId: { type: String, index: true, default: null },

    action: { type: String, enum: SYNC_ACTIONS, required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },

    // Idempotency — one action = one clientId. Retries are rejected.
    clientId: { type: String, required: true, unique: true, index: true },

    status: {
      type: String,
      enum: ['pending', 'applied', 'failed'],
      default: 'pending',
      index: true
    },
    error: { type: String, default: null },

    clientTimestamp: { type: Date, required: true },
    processedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

syncQueueSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('SyncQueue', syncQueueSchema);