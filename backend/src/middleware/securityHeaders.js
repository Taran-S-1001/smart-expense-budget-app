const config = require('../config');

/**
 * Security headers middleware
 * Emits standard HTTP security headers:
 * - Strict-Transport-Security (HSTS): Emitted only on secure responses (req.secure === true) per RFC 6797 Section 7.2
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Content-Security-Policy: default-src 'self'
 */
const securityHeaders = (req, res, next) => {
  if (req.secure) {
    const hstsValue = config.hstsIncludeSubdomains
      ? 'max-age=31536000; includeSubDomains'
      : 'max-age=31536000';
    res.setHeader('Strict-Transport-Security', hstsValue);
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'");

  next();
};

module.exports = securityHeaders;
