/**
 * Independent verification - D-06 Auth middleware stub and test-token helper
 * Tester: Dev A. Module owner: Dev B. Black-box against the real app.
 */
const jwt = require('jsonwebtoken');
const h = require('./helpers/harness');

let app;
beforeAll(async () => { await h.migrate(); app = h.getApp(); });
afterAll(async () => { await h.cleanupIndependentUsers(); await h.db.closePool(); });
const call = (token, path = '/api/accounts') => h.request(app).get(path).set('Authorization', `Bearer ${token}`);

describe('D-06 auth middleware and test-token helper', () => {
  const { signTestToken } = require('../../../src/auth/jwt');

  test('IND-MW-01 no Authorization header gives 401', async () => {
    const r = await h.request(app).get('/api/accounts');
    expect(r.status).toBe(401);
  });

  test.each([
    ['Basic scheme', 'Basic abc'],
    ['Token scheme', 'Token abc'],
    ['bare token', 'abc.def.ghi'],
    ['Bearer with no token', 'Bearer '],
    ['Bearer with garbage', 'Bearer not.a.jwt'],
    ['Bearer with two tokens', 'Bearer a b'],
  ])('IND-MW-02 %s gives 401', async (_l, header) => {
    const r = await h.request(app).get('/api/accounts').set('Authorization', header);
    expect(r.status).toBe(401);
  });

  test('IND-MW-03 token signed with another secret is rejected', async () => {
    const t = jwt.sign({ userId: 'u1', role: 'user', tokenType: 'access' }, 'another-secret', { expiresIn: 60 });
    expect((await call(t)).status).toBe(401);
  });

  test('IND-MW-04 unsigned token (alg none) is rejected', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const t = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ userId: 'u1', role: 'admin', tokenType: 'access', exp: Math.floor(Date.now() / 1000) + 600 })}.`;
    expect((await call(t)).status).toBe(401);
    expect((await call(t, '/api/admin/categories')).status).toBe(401);
  });

  test('IND-MW-05 token without expiry is rejected', async () => {
    const t = jwt.sign({ userId: 'u1', role: 'user', tokenType: 'access' }, process.env.JWT_SECRET);
    expect((await call(t)).status).toBe(401);
  });

  test('IND-MW-06 token with an unknown role is rejected', async () => {
    const t = jwt.sign({ userId: 'u1', role: 'superuser', tokenType: 'access' }, process.env.JWT_SECRET, { expiresIn: 60 });
    expect((await call(t)).status).toBe(401);
  });

  test('IND-MW-07 token with the payload edited (role user -> admin) but old signature is rejected', async () => {
    const t = jwt.sign({ userId: 'u1', role: 'user', tokenType: 'access' }, process.env.JWT_SECRET, { expiresIn: 60 });
    const [hd, , sig] = t.split('.');
    const forged = `${hd}.${Buffer.from(JSON.stringify({ userId: 'u1', role: 'admin', tokenType: 'access', exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url')}.${sig}`;
    expect((await call(forged, '/api/admin/categories')).status).toBe(401);
  });

  test('IND-MW-08 signTestToken helper produces a token the middleware accepts, carrying the given user and role', async () => {
    const t = signTestToken('helper-user-1', 'user');
    expect((await call(t)).status).not.toBe(401);
    expect(jwt.decode(t)).toMatchObject({ userId: 'helper-user-1', role: 'user' });
  });

  test('IND-MW-09 signTestToken refuses invalid input instead of producing a usable token', () => {
    expect(() => signTestToken('', 'user')).toThrow();
    expect(() => signTestToken('u1', 'root')).toThrow();
  });

  test('IND-MW-10 public endpoints stay reachable without a token', async () => {
    expect((await h.request(app).get('/api/health')).status).toBe(200);
  });
});
