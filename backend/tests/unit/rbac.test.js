const { requireRole, normalizeRole } = require('../../src/middleware/rbac');
const middlewareIndex = require('../../src/middleware');

describe('TC-Sec-06: requireRole middleware (Unit — SEBM-SR-005, Issue #28)', () => {
  const createMockRes = () => ({
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  });

  describe('export verification', () => {
    it('is exported from backend/src/middleware/index.js for S2-04 router integration', () => {
      expect(middlewareIndex.requireRole).toBeDefined();
      expect(typeof middlewareIndex.requireRole).toBe('function');
      expect(middlewareIndex.requireRole).toBe(requireRole);
    });

    it('exports normalizeRole helper function', () => {
      expect(typeof normalizeRole).toBe('function');
      expect(normalizeRole(' Admin ')).toBe('admin');
      expect(normalizeRole(null)).toBeNull();
      expect(normalizeRole('')).toBeNull();
    });
  });

  describe('allowed role access', () => {
    it('calls next() when user role matches the requested role exactly', () => {
      const middleware = requireRole('admin');
      const req = { user: { userId: 'admin-1', role: 'admin' } };
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeNull();
    });

    it('normalizes the requested role case-insensitively (e.g. requireRole("Admin"))', () => {
      const testCases = ['Admin', 'ADMIN', 'aDmIn', 'admin'];

      for (const roleVariant of testCases) {
        const middleware = requireRole(roleVariant);
        const req = { user: { userId: 'admin-1', role: 'admin' } };
        const res = createMockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBeNull();
      }
    });

    it('handles mixed-case user role gracefully', () => {
      const middleware = requireRole('Admin');
      const req = { user: { userId: 'admin-1', role: 'ADMIN' } };
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeNull();
    });

    it('supports non-admin roles when specified (reusable requirement)', () => {
      const middleware = requireRole('User');
      const req = { user: { userId: 'user-1', role: 'user' } };
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeNull();
    });

    it('supports an array of allowed roles', () => {
      const middleware = requireRole(['Admin', 'SuperAdmin']);
      const req = { user: { userId: 'admin-1', role: 'admin' } };
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeNull();
    });
  });

  describe('denied role access', () => {
    it('returns 403 Forbidden with the standard error envelope when user role is not admin', () => {
      const middleware = requireRole('Admin');
      const req = { user: { userId: 'user-1', role: 'user' } };
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: insufficient permissions.',
        },
      });
    });

    it('denies access when user role is unknown or arbitrary string', () => {
      const middleware = requireRole('Admin');
      const req = { user: { userId: 'guest-1', role: 'guest' } };
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('missing authenticated user context', () => {
    it('returns 401 Unauthorized when req.user is undefined', () => {
      const middleware = requireRole('Admin');
      const req = {};
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
    });

    it('returns 401 Unauthorized when req.user is null', () => {
      const middleware = requireRole('Admin');
      const req = { user: null };
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 Unauthorized when req.user is not an object or lacks a role', () => {
      const testCases = [
        { user: 'not-an-object' },
        { user: {} },
        { user: { userId: 'u1' } },
        { user: { userId: 'u1', role: null } },
        { user: { userId: 'u1', role: 123 } },
      ];

      for (const req of testCases) {
        const middleware = requireRole('Admin');
        const res = createMockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('returns 401 instead of 403 when unauthenticated even if the configured role is invalid', () => {
      const middleware = requireRole(null);
      const req = {};
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('invalid required role configuration (fail-closed behavior)', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['whitespace string', '   '],
      ['empty array', []],
      ['non-string type (number)', 123],
      ['array of invalid values', [null, '']],
    ])('denies access with 403 when configured with %s', (_, invalidRole) => {
      const middleware = requireRole(invalidRole);
      const req = { user: { userId: 'admin-1', role: 'admin' } };
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
