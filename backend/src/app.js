const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const config = require('./config');
const { errorHandler, notFoundHandler, securityHeaders, httpsEnforcer } = require('./middleware');

const app = express();

// Disable X-Powered-By header
app.disable('x-powered-by');

// Configure trusted proxy if specified
if (config.trustProxy !== false) {
  app.set('trust proxy', config.trustProxy);
}

// Security headers and HTTPS enforcement
app.use(securityHeaders);
app.use(httpsEnforcer);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check endpoint per project specifications
const healthHandler = (req, res) => {
  res.status(200).json({
    ok: true,
    status: 'ok',
    service: 'smart-expense-budget-app-backend',
    timestamp: new Date().toISOString(),
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// API Gateway routes
app.use('/api', routes);

// 404 Route Not Found handler
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

module.exports = app;
