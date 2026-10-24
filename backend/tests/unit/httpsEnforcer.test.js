const express = require('express');
const request = require('supertest');
const config = require('../../src/config');
const httpsEnforcer = require('../../src/middleware/httpsEnforcer');
const { isLoopbackAddress } = httpsEnforcer;

describe('HTTPS Enforcer Middleware (Unit)', () => {
  const originalEnforce = config.enforceHttps;

  afterEach(() => {
    config.enforceHttps = originalEnforce;
  });

  describe('isLoopbackAddress helper', () => {
    it('recognizes IPv4, IPv6, and IPv4-mapped IPv6 loopback addresses', () => {
      expect(isLoopbackAddress('127.0.0.1')).toBe(true);
      expect(isLoopbackAddress('::1')).toBe(true);
      expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    });

    it('rejects external and non-loopback addresses', () => {
      expect(isLoopbackAddress('203.0.113.10')).toBe(false);
      expect(isLoopbackAddress('10.0.0.1')).toBe(false);
      expect(isLoopbackAddress('192.168.1.1')).toBe(false);
      expect(isLoopbackAddress(undefined)).toBe(false);
      expect(isLoopbackAddress(null)).toBe(false);
      expect(isLoopbackAddress('')).toBe(false);
    });
  });

  describe('middleware behavior', () => {
    it('passes through when enforceHttps is disabled', () => {
      config.enforceHttps = false;
      const req = { secure: false, path: '/api/transactions' };
      const res = {};
      const next = jest.fn();

      httpsEnforcer(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('passes through when request is secure', () => {
      config.enforceHttps = true;
      const req = { secure: true, path: '/api/transactions' };
      const res = {};
      const next = jest.fn();

      httpsEnforcer(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('permits loopback HTTP health checks on /health and /api/health', () => {
      config.enforceHttps = true;
      const next = jest.fn();

      // IPv4 loopback
      httpsEnforcer(
        { secure: false, path: '/health', socket: { remoteAddress: '127.0.0.1' } },
        {},
        next
      );
      // IPv4-mapped IPv6 loopback
      httpsEnforcer(
        { secure: false, path: '/api/health', socket: { remoteAddress: '::ffff:127.0.0.1' } },
        {},
        next
      );

      expect(next).toHaveBeenCalledTimes(2);
    });

    it('rejects remote HTTP requests to health endpoints', () => {
      config.enforceHttps = true;
      let statusCode = null;
      let responseBody = null;
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };
      const next = jest.fn();

      httpsEnforcer(
        { secure: false, path: '/health', socket: { remoteAddress: '203.0.113.10' } },
        res,
        next
      );

      expect(next).not.toHaveBeenCalled();
      expect(statusCode).toBe(403);
      expect(responseBody).toEqual({
        error: {
          code: 'HTTPS_REQUIRED',
          message: 'HTTPS connection required. Plaintext HTTP is not allowed.',
        },
      });
    });

    it('prevents X-Forwarded-For spoofing to bypass loopback health-check enforcement', () => {
      config.enforceHttps = true;
      let statusCode = null;
      let responseBody = null;
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };
      const next = jest.fn();

      // Remote client attempting to spoof loopback via headers
      httpsEnforcer(
        {
          secure: false,
          path: '/health',
          headers: { 'x-forwarded-for': '127.0.0.1' },
          socket: { remoteAddress: '203.0.113.10' },
        },
        res,
        next
      );

      expect(next).not.toHaveBeenCalled();
      expect(statusCode).toBe(403);
      expect(responseBody.error.code).toBe('HTTPS_REQUIRED');
    });

    it('rejects non-health HTTP endpoints even from loopback socket', () => {
      config.enforceHttps = true;
      let statusCode = null;
      let responseBody = null;
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };
      const next = jest.fn();

      httpsEnforcer(
        { secure: false, path: '/api/transactions', socket: { remoteAddress: '127.0.0.1' } },
        res,
        next
      );

      expect(next).not.toHaveBeenCalled();
      expect(statusCode).toBe(403);
      expect(responseBody.error.code).toBe('HTTPS_REQUIRED');
    });
  });

  describe('proxy integration & header spoofing prevention', () => {
    it('rejects spoofed X-Forwarded-Proto when trust proxy is false', async () => {
      const testApp = express();
      testApp.set('trust proxy', false);
      testApp.use((req, res, next) => {
        config.enforceHttps = true;
        next();
      });
      testApp.use(httpsEnforcer);
      testApp.get('/api/test', (req, res) => res.json({ ok: true }));

      const res = await request(testApp)
        .get('/api/test')
        .set('X-Forwarded-Proto', 'https');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('HTTPS_REQUIRED');
    });

    it('accepts X-Forwarded-Proto when trust proxy is configured', async () => {
      const testApp = express();
      testApp.set('trust proxy', 'loopback');
      testApp.use((req, res, next) => {
        config.enforceHttps = true;
        next();
      });
      testApp.use(httpsEnforcer);
      testApp.get('/api/test', (req, res) => res.json({ ok: true }));

      const res = await request(testApp)
        .get('/api/test')
        .set('X-Forwarded-Proto', 'https');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });
});
