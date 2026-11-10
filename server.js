// server.js
require('dotenv').config();

const fs = require('fs');
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const { connectDB, disconnectDB } = require('./server/config/db');
const logger = require('./server/utils/logger');

const app = express();

// ---------- Security & performance middleware ----------
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({ origin: true, credentials: true }));
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use(rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max:      Number(process.env.RATE_LIMIT_MAX) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
}));

// ---------- Static files ----------
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// ---------- Health check ----------
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), env: process.env.NODE_ENV });
});

// ---------- API routers ----------
const mount = (p, mod) => {
  try {
    app.use(p, require(mod));
  } catch (err) {
    logger.warn(`Route ${p} not mounted yet: ${err.message}`);
  }
};

mount('/api/subjects', './server/routes/subjects');
mount('/api/lessons',  './server/routes/lessons');
mount('/api/packs',    './server/routes/packs');
mount('/api/ai',       './server/routes/ai');
mount('/api/sync',     './server/routes/sync');
mount('/api/quiz',     './server/routes/quiz');
mount('/api/admin',    './server/routes/admin');
mount('/api/feedback', './server/routes/feedback');
mount('/api/classroom', './server/routes/classroom');   // ← NEW

// ---------- Pure HTML page routes ----------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/home.html')));

// Short URL that redirects to the currently active classroom session
// Used by the QR code so students type fewer characters
app.get('/c', (req, res) => {
  try {
    const localNetwork = require('./server/services/localNetwork');
    const session = localNetwork.getSession();
    if (!session) return res.redirect('/pages/help.html#classroom-not-active');
    return res.redirect(`/pages/classroom.html?session=${session.id}`);
  } catch (err) {
    return res.redirect('/');
  }
});

app.get('/pages/:page', (req, res, next) => {
  const page = req.params.page.replace(/\.html$/, '');
  // Reject anything that could traverse up directories
  if (!/^[a-zA-Z0-9_-]+$/.test(page)) return next();

  const filePath = path.join(__dirname, 'public/pages', `${page}.html`);

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) return next(); // file doesn't exist → fall through to 404
    res.sendFile(filePath); // ✅ do NOT pass a callback — sendFile manages the response
  });
});

// ---------- 404 handler ----------
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found', code: 'NOT_FOUND' });
  }

  const helpPath = path.join(__dirname, 'public/pages/help.html');
  if (fs.existsSync(helpPath)) {
    return res.status(404).sendFile(helpPath);
  }

  res.status(404).send(`<!DOCTYPE html>
<html>
<head>
  <title>404 — Kelvin Hub</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { font-family: system-ui,-apple-system,sans-serif; display:grid; place-items:center;
           min-height:100vh; margin:0; background:#0f2027; color:#f8fafc; text-align:center; padding:1rem; }
    h1 { font-size:2rem; margin:0 0 1rem; }
    p  { opacity:.8; margin:0 0 1.5rem; max-width:40ch; }
    a  { color:#2dd4bf; font-weight:600; }
  </style>
</head>
<body>
  <div>
    <h1>404 — Page not found</h1>
    <p>This page hasn't been built yet. It will appear as the next build steps complete.</p>
    <a href="/">← Return to home</a>
  </div>
</body>
</html>`);
});

// ---------- Global error handler ----------
app.use((err, req, res, next) => {
  logger.error(`${req.method} ${req.originalUrl} → ${err.message}`);

  if (res.headersSent) {
    return next(err);
  }

  if (req.path.startsWith('/api/')) {
    return res.status(err.status || 500).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
  }
  res.status(err.status || 500).send('Something went wrong.');
});

// ---------- Boot sequence ----------
async function start() {
  try {
    await connectDB();
    const PORT = Number(process.env.PORT) || 3000;
    const server = app.listen(PORT, () =>
      logger.info(`Kelvin Hub listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`)
    );

    const shutdown = async (signal) => {
      logger.warn(`Received ${signal}. Shutting down...`);
      // Clean up classroom session if active
      try {
        const localNetwork = require('./server/services/localNetwork');
        localNetwork.stopClassroomSession();
      } catch {}
      server.close(async () => {
        await disconnectDB();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('unhandledRejection', (r) => logger.error('Unhandled rejection:', r));
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception:', err.message);
      logger.error(err.stack);
    });
  } catch (err) {
    logger.error('Startup failed:', err.message);
    process.exit(1);
  }
}

start();