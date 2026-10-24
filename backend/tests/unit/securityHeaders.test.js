const request = require('supertest');
const app = require('../../src/app');
const config = require('../../src/config');
const securityHeaders = require('../../src/middleware/securityHeaders');

describe('Security Headers Middleware (Unit)', () => {
  it('sets standard security headers and omits HSTS on insecure requests', () => {
    const req = { secure: false };
    const headers = {};
    const res = {
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      },
    };
    const next = jest.fn();

    securityHeaders(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['content-security-policy']).toBe("default-src 'self'");
    expect(headers['strict-transport-security']).toBeUndefined();
  });

  it('emits Strict-Transport-Security on secure requests', () => {
    const req = { secure: true };
    const headers = {};
    const res = {
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      },
    };
    const next = jest.fn();

    config.hstsIncludeSubdomains = false;
    securityHeaders(req, res, next);

    expect(headers['strict-transport-security']).toBe('max-age=31536000');
  });

  it('emits includeSubDomains when configured', () => {
    const req = { secure: true };
    const headers = {};
    const res = {
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      },
    };
    const next = jest.fn();

    config.hstsIncludeSubdomains = true;
    securityHeaders(req, res, next);

    expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');

    // Reset config flag
    config.hstsIncludeSubdomains = false;
  });

  it('disables X-Powered-By header on Express app responses', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['content-security-policy']).toBe("default-src 'self'");
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });
});
