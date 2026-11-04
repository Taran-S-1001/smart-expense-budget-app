const http = require('http');
const https = require('https');
const fs = require('fs');
const app = require('./app');
const config = require('./config');
const { startReminderScheduler, stopReminderScheduler } = require('./reminders/reminderScheduler');

const validateTlsFiles = (certPath, keyPath) => {
  if (
    !certPath ||
    typeof certPath !== 'string' ||
    !certPath.trim() ||
    !keyPath ||
    typeof keyPath !== 'string' ||
    !keyPath.trim()
  ) {
    throw new Error('TLS configuration error: TLS_CERT_PATH and TLS_KEY_PATH are required when TLS_ENABLED=true.');
  }

  const trimmedCert = certPath.trim();
  const trimmedKey = keyPath.trim();

  let certStat;
  try {
    certStat = fs.statSync(trimmedCert);
  } catch (err) {
    throw new Error(`TLS configuration error: TLS_CERT_PATH file does not exist: ${trimmedCert}`);
  }
  if (!certStat.isFile()) {
    throw new Error(`TLS configuration error: TLS_CERT_PATH path is not a file: ${trimmedCert}`);
  }

  let keyStat;
  try {
    keyStat = fs.statSync(trimmedKey);
  } catch (err) {
    throw new Error(`TLS configuration error: TLS_KEY_PATH file does not exist: ${trimmedKey}`);
  }
  if (!keyStat.isFile()) {
    throw new Error(`TLS configuration error: TLS_KEY_PATH path is not a file: ${trimmedKey}`);
  }
};

const createServer = (appInstance = app, cfg = config) => {
  if (cfg.tls && cfg.tls.enabled) {
    validateTlsFiles(cfg.tls.certPath, cfg.tls.keyPath);
    const minVersion = cfg.tls.minVersion || 'TLSv1.2';
    if (minVersion !== 'TLSv1.2' && minVersion !== 'TLSv1.3') {
      throw new Error(
        `Invalid TLS minVersion: "${minVersion}". Protocol versions weaker than TLSv1.2 are rejected per AC-SEBM-SR-001.`
      );
    }
    const cert = fs.readFileSync(cfg.tls.certPath.trim());
    const key = fs.readFileSync(cfg.tls.keyPath.trim());
    return https.createServer(
      {
        cert,
        key,
        minVersion,
      },
      appInstance
    );
  }
  return http.createServer(appInstance);
};

const PORT = config.port;
const server = createServer(app, config);

// Start listening if not running in a test environment or when invoked directly
if (process.env.NODE_ENV !== 'test' || require.main === module) {
  server.listen(PORT, () => {
    const protocol = config.tls && config.tls.enabled ? 'https' : 'http';
    console.log(`SEBM backend listening on port ${PORT} (${protocol}) [${config.nodeEnv}]`);
    startReminderScheduler();
  });
}

// Graceful shutdown handling
const handleShutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  stopReminderScheduler();
  server.close(async () => {
    try {
      const db = require('./db');
      await db.closePool();
    } catch (err) {
      console.error('Error closing database pool during shutdown:', err);
    }
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

server.createServer = createServer;
server.validateTlsFiles = validateTlsFiles;
server.startReminderScheduler = startReminderScheduler;
server.stopReminderScheduler = stopReminderScheduler;

module.exports = server;
