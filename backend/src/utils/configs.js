const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { logger } = require('./logger');
const { redisCache } = require('./redisCache');

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = parseInt(process.env.PORT || '3000', 10);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/todoapp';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '5242880', 10);
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
const ENABLE_ANALYTICS = process.env.ENABLE_ANALYTICS !== 'false';
const ENABLE_FILE_UPLOAD = process.env.ENABLE_FILE_UPLOAD !== 'false';
const ENABLE_METRICS = process.env.ENABLE_METRICS === 'true';
const CACHE_TTL = 300;
const PRIORITIES = ['low', 'medium', 'high'];
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const defaultLevel = NODE_ENV === 'production' ? 'info' : 'debug';
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS[defaultLevel];

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path
      .extname(file.originalname)
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, '')
      .slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!ENABLE_FILE_UPLOAD) {
      return cb(Object.assign(new Error('File upload is disabled'), { status: 403 }));
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(
        Object.assign(new Error(`File type not allowed: ${file.mimetype}`), { status: 400 })
      );
    }
    cb(null, true);
  },
});

const fixName = name => Buffer.from(name, 'latin1').toString('utf8');

const toAttachments = (files = []) =>
  files.map(f => ({
    filename: f.filename,
    originalName: fixName(f.originalname),
    mimeType: f.mimetype,
    size: f.size,
    uploadedAt: new Date(),
  }));

async function removeFiles(names = []) {
  await Promise.all(
    names.map(name =>
      fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(name))).catch(() => {})
    )
  );
}

async function cacheGet(key) {
  if (!redisCache.client.isReady) return null;
  try {
    const raw = await redisCache.client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn('Cache get failed', { error: err.message });
    return null;
  }
}

async function cacheSet(key, value) {
  if (!redisCache.client.isReady) return;
  try {
    await redisCache.client.setEx(key, CACHE_TTL, JSON.stringify(value));
  } catch (err) {
    logger.warn('Cache set failed', { error: err.message });
  }
}

async function cacheClear() {
  if (!redisCache.client.isReady) return;
  try {
    const keys = [];
    for await (const key of redisCache.client.scanIterator({ MATCH: 'cache:*', COUNT: 100 })) {
      keys.push(key);
    }
    if (keys.length) await redisCache.client.del(keys);
  } catch (err) {
    logger.warn('Cache clear failed', { error: err.message });
  }
}

module.exports = {
  NODE_ENV,
  PORT,
  MONGODB_URI,
  REDIS_URL,
  CORS_ORIGIN,
  MAX_FILE_SIZE,
  UPLOAD_DIR,
  ENABLE_ANALYTICS,
  ENABLE_FILE_UPLOAD,
  ENABLE_METRICS,
  PRIORITIES,
  ALLOWED_MIME,
  LEVELS,
  currentLevel,
  upload,
  storage,
  toAttachments,
  removeFiles,
  cacheGet,
  cacheSet,
  cacheClear
};
