/**
 * Independent verification - S2-02 Session timeout (SEBM-SR-004) and D-06 auth middleware / test-token helper.
 * AC-SEBM-SR-004: session expires and requires re-authentication after the configured timeout.
 */
process.env.SESSION_TIMEOUT_SECONDS = '2';
const jwt = require('jsonwebtoken');
const h = require('./helpers/harness');

let app;
beforeAll(async () => { await h.migrate(); app = h.getApp(); });
afterAll(async () => { delete process.env.SESSION_TIMEOUT_SECONDS; await h.cleanupIndependentUsers(); await h.db.closePool(); });
const call = (token, path = '/api/accounts') => h.request(app).get(path).set('Authorization', `Bearer ${token}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('S2-02 session timeout (SEBM-SR-004)', () => {
  test('IND-SES-01 login reports the configured timeout as expiresIn and the token exp matches', async () => {
    const { res } = await h.registerAndLogin(app);
    expect(res.body.expiresIn).toBe(2);
    const p = jwt.decode(res.body.token);
    expect(p.exp - p.iat).toBe(2);
  });

  test('IND-SES-02 token works before the timeout and is rejected with 401 after it', async () => {
    const { res } = await h.registerAndLogin(app);
    expect([401, 403]).not.toContain((await call(res.body.token)).status);
    await sleep(3200);
    const after = await call(res.body.token);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('INVALID_TOKEN');
  });

  test('IND-SES-03 after timeout the user can re-authenticate with credentials', async () => {
    const { res, creds } = await h.registerAndLogin(app);
    await sleep(2500);
    expect((await call(res.body.token)).status).toBe(401);
    const again = await h.request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    expect(again.status).toBe(200);
    expect((await call(again.body.token)).status).not.toBe(401);
  });

  test('IND-SES-04 a refresh token issues a new short-lived access token with the same timeout', async () => {
    const { res } = await h.registerAndLogin(app);
    const r = await h.request(app).post('/api/auth/refresh').send({ refreshToken: res.body.refreshToken });
    expect(r.status).toBe(200);
    const p = jwt.decode(r.body.token);
    expect(p.exp - p.iat).toBe(2);
  });

  test('IND-SES-06 the default session timeout (no env override) is 15 minutes or less', () => {
    const { execFileSync } = require('child_process');
    const out = execFileSync('node', ['-e', "console.log(require('./src/config').sessionTimeoutSeconds)"], { 
    cwd: require('path').join(__dirname, '..', '..', '..'), 
    env: { PATH: process.env.PATH, NODE_ENV: 'test' } 
    }).toString().trim();   
    expect(Number(out)).toBeGreaterThan(0);
    expect(Number(out)).toBeLessThanOrEqual(900);
  });
});
