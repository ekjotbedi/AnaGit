'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const helmet = require('helmet');
const morgan = require('morgan');

const { config } = require('./config');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const repoRoutes = require('./routes/repo.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const exportRoutes = require('./routes/export.routes');
const webhookRoutes = require('./routes/webhook.routes');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function createApp() {
  const app = express();

  if (config.isProd) app.set('trust proxy', 1);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https://*.githubusercontent.com'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
        },
      },
    })
  );
  if (!config.isProd) app.use(morgan('dev'));

  // Browser UI
  // Registered before the session middleware so requests for CSS/JS don't
  // do needless session lookups
  app.use(express.static(PUBLIC_DIR));

  // Webhooks: MUST be registered before the JSON body parser, because
  // signature verification needs raw, unmodified request body
  app.use('/api/webhooks', express.raw({ type: '*/*' }), webhookRoutes);

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Sessions (stored in MongoDB)
  app.use(
    session({
      name: 'anagit.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        client: mongoose.connection.getClient(),
        ttl: 7 * 24 * 60 * 60, 
      }),
      cookie: {
        httpOnly: true, 
        secure: config.isProd,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  // Health & info
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'anagit',
      time: new Date().toISOString(),
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
  });
  // "/" now serves the dashboard, so the API's info payload lives at /api.
  app.get('/api', (req, res) => {
    res.json({
      name: 'AnaGit API',
      message: 'GitHub Engineering Analytics Dashboard',
      ui: '/',
      docs: 'See docs/api.md for the full list of endpoints.',
    });
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/me', userRoutes);
  // Order matters: the more specific export path is registered first.
  app.use('/api/repos/:id/export', exportRoutes);
  app.use('/api/repos', repoRoutes);
  app.use('/api/repos/:id', analyticsRoutes);

  // UI fallback
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path === '/api' || req.path.startsWith('/api/')) return next();
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  // 404 + error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp, PUBLIC_DIR };
