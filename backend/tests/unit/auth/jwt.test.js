const jwt = require('jsonwebtoken');
const config = require('../../../src/config');
const { authenticateToken, signTestToken } = require('../../../src/auth/jwt');

const TEST_SECRET = 'test-secret-for-auth-unit-tests-only';
const originalJwtSecret = config.jwtSecret;

const runMiddleware = (authorization) => {
  const req = { headers: authorization ? { authorization } : {} };
  const res = {
    statusCode: null,
    body: null,
    status: jest.fn(function setStatus(code) {
      this.statusCode = code;
      return this;
    }),
    json(body) {
      this.body = body;
      return this;
    },
  };
  const next = jest.fn();

  authenticateToken(req, res, next);
  return { req, res, next };
};

const createSignedToken = (claims, options = {}) =>
  jwt.sign(claims, TEST_SECRET, { algorithm: 'HS256', ...options });

describe('TC-Auth-01: JWT middleware (SEBM-F-002)', () => {
  // AC-SEBM-F-002: Valid credentials grant access to the dashboard; invalid credentials are rejected with an error message.
  beforeEach(() => {
    config.jwtSecret = TEST_SECRET;
  });

  afterAll(() => {
    config.jwtSecret = originalJwtSecret;
  });

  it('sets req.user for a valid token', () => {
    const token = createSignedToken({ userId: 'user-123', role: 'user' }, { expiresIn: '5m' });
    const { req, res, next } = runMiddleware(`Bearer ${token}`);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ userId: 'user-123', role: 'user' });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a missing Authorization header', () => {
    const { res, next } = runMiddleware();

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('MISSING_AUTHORIZATION');
  });

  it('rejects a non-Bearer authorization scheme', () => {
    const { res, next } = runMiddleware('Basic abc123');

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('INVALID_AUTHORIZATION');
  });

  it.each([
    ['a malformed token', 'Bearer not-a-jwt'],
    ['a token with a bad signature', `Bearer ${jwt.sign({ userId: 'user-123', role: 'User' }, 'wrong-secret', { algorithm: 'HS256' })}`],
    ['an expired token', `Bearer ${createSignedToken({ userId: 'user-123', role: 'User', exp: Math.floor(Date.now() / 1000) - 60 }, {})}`],
    ['a token with an invalid role', `Bearer ${createSignedToken({ userId: 'user-123', role: 'Owner' }, { expiresIn: '5m' })}`],
    ['a token without a role', `Bearer ${createSignedToken({ userId: 'user-123' }, { expiresIn: '5m' })}`],
    ['an unsigned token', `Bearer ${jwt.sign({ userId: 'user-123', role: 'User', exp: Math.floor(Date.now() / 1000) + 60 }, undefined, { algorithm: 'none' })}`],
  ])('rejects %s with a generic token error', (description, authorization) => {
    const { res, next } = runMiddleware(authorization);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      },
    });
  });

  it('creates a token accepted by the middleware', () => {
    const token = signTestToken('user-456', 'admin');
    const { req, next } = runMiddleware(`Bearer ${token}`);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ userId: 'user-456', role: 'admin' });
  });

  it('signs title-case role input using the canonical lowercase claim', () => {
    const token = signTestToken('user-789', 'User');

    expect(jwt.verify(token, TEST_SECRET, { algorithms: ['HS256'] }).role).toBe('user');
  });

  it('normalizes legacy title-case roles to the database role values', () => {
    const token = createSignedToken({ userId: 'user-legacy', role: 'User' }, { expiresIn: '5m' });
    const { req, next } = runMiddleware(`Bearer ${token}`);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ userId: 'user-legacy', role: 'user' });
  });

  it('rejects unsupported roles when signing a test token', () => {
    expect(() => signTestToken('user-789', 'Owner')).toThrow('role must be user or admin');
  });
});