const http = require('http');
const https = require('https');
const fs = require('fs');
const app = require('./app');
const config = require('./config');

const validateTlsFiles = (certPath, keyPath) => {
  if (!certPath || !keyPath) {
    throw new Error('TLS configuration error: TLS_CERT_PATH and TLS_KEY_PATH are required when TLS_ENABLED=true.');
  }
  if (!fs.existsSync(certPath)) {
    throw new Error(`TLS configuration error: TLS_CERT_PATH file does not exist: ${certPath}`);
  }
  if (!fs.existsSync(keyPath)) {
    throw new Error(`TLS configuration error: TLS_KEY_PATH file does not exist: ${keyPath}`);
  }
};

const createServer = (appInstance = app, cfg = config) => {
  if (cfg.tls && cfg.tls.enabled) {
    validateTlsFiles(cfg.tls.certPath, cfg.tls.keyPath);
    const cert = fs.readFileSync(cfg.tls.certPath);
    const key = fs.readFileSync(cfg.tls.keyPath);
    return https.createServer(
      {
        cert,
        key,
        minVersion: cfg.tls.minVersion || 'TLSv1.2',
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
  });
}

// Graceful shutdown handling
const handleShutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
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

module.exports = server;
