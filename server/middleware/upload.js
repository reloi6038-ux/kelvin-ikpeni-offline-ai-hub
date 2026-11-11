// server/middleware/upload.js
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const lower = (file.originalname || '').toLowerCase();
    const ok =
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lower.endsWith('.pdf') ||
      lower.endsWith('.docx');
    if (ok) return cb(null, true);
    cb(new Error('Only PDF and .docx files are allowed'));
  }
});

module.exports = { upload };