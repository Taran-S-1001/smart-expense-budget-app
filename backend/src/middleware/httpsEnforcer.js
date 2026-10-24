const config = require('../config');

/**
 * Normalizes an IP address and determines if it represents a loopback address.
 * Handles IPv4 (127.0.0.1), IPv6 (::1), and IPv4-mapped IPv6 (::ffff:127.0.0.1).
 */
const isLoopbackAddress = (ip) => {
  if (!ip || typeof ip !== 'string') return false;
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return normalized === '127.0.0.1' || normalized === '::1';
};

/**
 * Middleware that enforces HTTPS when config.enforceHttps is active.
 * - Allows requests that are already secure (req.secure === true)
 * - Allows HTTP health checks ONLY from the actual loopback socket address (req.socket.remoteAddress)
 * - Never trusts X-Forwarded-For to determine the loopback exception (preventing external bypass spoofing)
 * - Rejects all other plaintext HTTP requests with HTTP 403 and standardized SAD 4.4 error
 */
const httpsEnforcer = (req, res, next) => {
  if (!config.enforceHttps) {
    return next();
  }

  if (req.secure) {
    return next();
  }

  const isHealthPath = req.path === '/health' || req.path === '/api/health';
  const remoteAddress = req.socket && req.socket.remoteAddress;

  if (isHealthPath && isLoopbackAddress(remoteAddress)) {
    return next();
  }

  return res.status(403).json({
    error: {
      code: 'HTTPS_REQUIRED',
      message: 'HTTPS connection required. Plaintext HTTP is not allowed.',
    },
  });
};

module.exports = httpsEnforcer;
module.exports.isLoopbackAddress = isLoopbackAddress;
