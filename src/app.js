'use strict';

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const { config } = require('./config');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const repoRoutes = require('./routes/repo.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const exportRoutes = require('./routes/export.routes');
const webhookRoutes = require('./routes/webhook.routes');

/*
 Build and configure the Express application.
 export a factory (rather than a ready-made app) so the caller can
 connect to MongoDB first — the session store reuses that connection.
 */
function createApp() {
  const app = express();

  // Behind a proxy (e.g. in production), trusted so secure cookies work.
  if (config.isProd) app.set('trust proxy', 1);

  // --- Security & logging ---
  app.use(helmet());
  app.use(
    cors({
      origin: config.clientUrl,
      credentials: true, // allow the session cookie to be sent
    })
  );
  if (!config.isProd) app.use(morgan('dev'));

  // --- Webhooks: MUST be registered before the JSON body parser, because
  //     signature verification needs the raw, unmodified request body. ---
  app.use('/api/webhooks', express.raw({ type: '*/*' }), webhookRoutes);

  // --- Body parsing for everything else ---
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // --- Sessions ---
  app.use(
    session({
      name: 'anagit.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        client: mongoose.connection.getClient(),
        ttl: 7 * 24 * 60 * 60, // 7 days, in seconds
      }),
      cookie: {
        httpOnly: true,
        secure: config.isProd,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  // --- Health & info ---
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'anagit-backend',
      time: new Date().toISOString(),
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
  });
  app.get('/', (req, res) => {
    res.json({
      name: 'AnaGit API',
      message: 'GitHub Engineering Analytics Dashboard — backend',
      docs: 'See README.md for the full list of endpoints.',
    });
  });

  // --- API routes ---
  app.use('/api/auth', authRoutes);
  app.use('/api/me', userRoutes);
  app.use('/api/repos/:id/export', exportRoutes);
  app.use('/api/repos', repoRoutes);
  app.use('/api/repos/:id', analyticsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
