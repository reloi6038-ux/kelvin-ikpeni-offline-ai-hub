// server/models/Subject.js
const mongoose = require('mongoose');
const { EDUCATION_LEVELS, CURRICULA, slugify } = require('../utils/helpers');

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Subject name is required'],
      trim: true,
      maxlength: 80
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true
    },
    description: { type: String, maxlength: 500, default: '' },
    curriculum: {
      type: String,
      enum: CURRICULA,
      default: 'Nigerian',
      index: true
    },
    levels: [
      {
        type: String,
        enum: EDUCATION_LEVELS
      }
    ],
    icon: { type: String, default: '📘' }, // emoji is data-free
    color: { type: String, default: '#2563eb' },
    isActive: { type: Boolean, default: true, index: true },
    lessonCount: { type: Number, default: 0 } // denormalized for fast listing
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

// Auto-slug from name if not provided
subjectSchema.pre('validate', function () {
  if (!this.slug && this.name) this.slug = slugify(this.name);
});

subjectSchema.index({ curriculum: 1, isActive: 1 });

module.exports = mongoose.model('Subject', subjectSchema);