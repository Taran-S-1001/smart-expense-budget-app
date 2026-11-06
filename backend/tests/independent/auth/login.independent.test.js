/**
 * Independent verification - S1-02 Login, JWT session (SEBM-F-002)
 * AC-SEBM-F-002: valid credentials grant access; invalid credentials are rejected with an error message.
 * Session persistence: token returned at login must authenticate later requests.
 */
const jwt = require('jsonwebtoken');
const h = require('./helpers/harness');

let app;
beforeAll(async () => { await h.migrate(); app = h.getApp(); });
afterAll(async () => { await h.cleanupIndependentUsers(); await h.db.closePool(); });

const protectedCall = (token) => h.request(app).get('/api/accounts').set('Authorization', `Bearer ${token}`);

describe('S1-02 login (SEBM-F-002)', () => {
  test('IND-LOG-01 valid credentials return 200 with token, refresh token and user, no password data', async () => {
    const { res, creds } = await h.registerAndLogin(app);
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.tokenType).toBe('Bearer');
    expect(res.body.user.email).toBe(creds.email);
    expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/i);
  });

  test('IND-LOG-02 token from login authenticates a protected endpoint (session persistence)', async () => {
    const { res } = await h.registerAndLogin(app);
    const first = await protectedCall(res.body.token);
    const second = await protectedCall(res.body.token);
    expect([first.status, second.status]).not.toContain(401);
    expect([first.status, second.status]).not.toContain(403);
  });

  test('IND-LOG-03 wrong password returns 401 with an error message and no token', async () => {
    const { creds } = await h.registerAndLogin(app);
    const res = await h.request(app).post('/api/auth/login').send({ email: creds.email, password: 'WrongPassw0rd!' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toEqual(expect.any(String));
    expect(res.body.token).toBeUndefined();
  });

  test('IND-LOG-04 unknown email gives the same status and message as wrong password (no user enumeration)', async () => {
    const { creds } = await h.registerAndLogin(app);
    const wrongPw = await h.request(app).post('/api/auth/login').send({ email: creds.email, password: 'WrongPassw0rd!' });
    const unknown = await h.request(app).post('/api/auth/login').send({ email: h.uniqueEmail('ghost'), password: 'WrongPassw0rd!' });
    expect(unknown.status).toBe(wrongPw.status);
    expect(unknown.body.error.message).toBe(wrongPw.body.error.message);
  });

  test('IND-LOG-05 login email is case and whitespace insensitive', async () => {
    const { creds } = await h.registerAndLogin(app);
    const res = await h.request(app).post('/api/auth/login').send({ email: ` ${creds.email.toUpperCase()} `, password: creds.password });
    expect(res.status).toBe(200);
  });

  test('IND-LOG-06 password is case sensitive', async () => {
    const { creds } = await h.registerAndLogin(app);
    const res = await h.request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password.toUpperCase() });
    expect(res.status).toBe(401);
  });

  test.each([
    ['missing body', undefined],
    ['missing password', { email: 'a@b.co' }],
    ['missing email', { password: 'x' }],
    ['empty password', { email: 'a@b.co', password: '' }],
    ['object injected as email', { email: { $ne: '' }, password: 'x' }],
    ['array as password', { email: 'a@b.co', password: ['x'] }],
  ])('IND-LOG-07 malformed input (%s) returns 400 not 500', async (_l, payload) => {
    const req = h.request(app).post('/api/auth/login');
    const res = await (payload === undefined ? req : req.send(payload));
    expect(res.status).toBe(400);
  });

  test("IND-LOG-08 SQL-injection style credentials do not log in", async () => {
    const res = await h.request(app).post('/api/auth/login').send({ email: "' OR '1'='1@x.co", password: "' OR '1'='1" });
    expect([400, 401]).toContain(res.status);
    expect(res.body.token).toBeUndefined();
  });

  test('IND-LOG-09 access token carries user id and role and is a short-lived access token', async () => {
    const { res } = await h.registerAndLogin(app);
    const payload = jwt.decode(res.body.token);
    expect(payload.userId).toBe(res.body.user.userId);
    expect(payload.role).toBe('user');
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(60 * 60);
  });

  test('IND-LOG-10 refresh token returns a working new access token', async () => {
    const { res } = await h.registerAndLogin(app);
    const refreshed = await h.request(app).post('/api/auth/refresh').send({ refreshToken: res.body.refreshToken });
    expect(refreshed.status).toBe(200);
    const call = await protectedCall(refreshed.body.token);
    expect([401, 403]).not.toContain(call.status);
  });

  test('IND-LOG-11 an access token cannot be used as a refresh token', async () => {
    const { res } = await h.registerAndLogin(app);
    const r = await h.request(app).post('/api/auth/refresh').send({ refreshToken: res.body.token });
    expect(r.status).toBe(401);
  });

  test('IND-LOG-12 a refresh token cannot be used as an access token', async () => {
    const { res } = await h.registerAndLogin(app);
    const call = await protectedCall(res.body.refreshToken);
    expect(call.status).toBe(401);
  });
});
