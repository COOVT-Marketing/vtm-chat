const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB — generous enough for a few minutes of voice audio
const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument.*)|audio\/(webm|ogg|mpeg|mp3|mp4|wav|x-wav|m4a))$/;

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname) || ''}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.test(file.mimetype)) return cb(new Error('File type not allowed'));
    cb(null, true);
  },
});

router.post('/', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: true, message: 'No file uploaded', code: 400 });
  res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    fileName: req.file.originalname || req.file.filename,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    durationSeconds: req.body.durationSeconds ? Number(req.body.durationSeconds) : null,
  });
});

module.exports = router;
