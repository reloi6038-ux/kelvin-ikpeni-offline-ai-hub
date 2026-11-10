// server/models/Admin.js
const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 40
    },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, default: 'Administrator' },
    role: { type: String, enum: ['admin', 'superadmin'], default: 'admin' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null }
  },
  { timestamps: true }
);

adminSchema.index({ username: 1 });

module.exports = mongoose.model('Admin', adminSchema);