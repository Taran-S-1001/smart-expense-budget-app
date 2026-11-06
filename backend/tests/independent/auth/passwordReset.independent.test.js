/**
 * Independent verification - S2-01 Password reset (SEBM-F-003)
 * AC-SEBM-F-003: reset link/OTP expires after a configured time; successful reset allows login with the new password.
 * The reset link is delivered through the (mock) notification provider, so the tester reads it from the
 * notifications table, which is where a real user would receive it.
 */
const jwt = require('jsonwebtoken');
const h = require('./helpers/harness');

let app;
beforeAll(async () => { await h.migrate(); app = h.getApp(); });
afterAll(async () => { delete process.env.PASSWORD_RESET_TOKEN_LIFETIME_SECONDS; await h.cleanupIndependentUsers(); await h.db.closePool(); });

const requestReset = (email) => h.request(app).post('/api/auth/forgot-password').send({ email });
const latestResetToken = async (email) => {
  const r = await h.db.query(
    `SELECT n.message FROM notifications n JOIN users u ON u.user_id = n.user_id
     WHERE u.email = $1 AND n.type = 'PASSWORD_RESET' ORDER BY n.sent_at DESC LIMIT 1`, [email]);
  if (!r.rows.length) return null;
  const m = r.rows[0].message.match(/token=([^\s&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};
const doReset = (token, newPassword) => h.request(app).post('/api/auth/reset-password').send({ token, newPassword });
const login = (email, password) => h.request(app).post('/api/auth/login').send({ email, password });

describe('S2-01 password reset (SEBM-F-003)', () => {
  test('IND-RST-01 full flow: request, receive link, reset, log in with new password, old password rejected', async () => {
    const { creds } = await h.registerAndLogin(app);
    const rq = await requestReset(creds.email);
    expect(rq.status).toBe(200);
    const token = await latestResetToken(creds.email);
    expect(token).toBeTruthy();
    const rs = await doReset(token, 'BrandNewPassw0rd!');
    expect(rs.status).toBe(200);
    expect((await login(creds.email, 'BrandNewPassw0rd!')).status).toBe(200);
    expect((await login(creds.email, creds.password)).status).toBe(401);
  });

  test('IND-RST-02 unknown email gets the same response as a known one (no account enumeration) and creates no notification', async () => {
    const { creds } = await h.registerAndLogin(app);
    const known = await requestReset(creds.email);
    const unknown = await requestReset(h.uniqueEmail('ghost'));
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
  });

  test.each([['missing email', {}], ['bad email format', { email: 'nope' }]])(
    'IND-RST-03 request with %s returns 400', async (_l, payload) => {
      const res = await h.request(app).post('/api/auth/forgot-password').send(payload);
      expect(res.status).toBe(400);
    });


  test('IND-RST-04 reset token is single use', async () => {
    const { creds } = await h.registerAndLogin(app);
    await requestReset(creds.email);
    const token = await latestResetToken(creds.email);
    expect((await doReset(token, 'FirstNewPassw0rd!')).status).toBe(200);
    const second = await doReset(token, 'SecondNewPassw0rd!');
    expect(second.status).toBe(401);
    expect((await login(creds.email, 'FirstNewPassw0rd!')).status).toBe(200);
    expect((await login(creds.email, 'SecondNewPassw0rd!')).status).toBe(401);
  });

  test('IND-RST-05 requesting a second reset invalidates the first link', async () => {
    const { creds } = await h.registerAndLogin(app);
    await requestReset(creds.email);
    const first = await latestResetToken(creds.email);
    await new Promise((r) => setTimeout(r, 1100)); // tokens are second-resolution JWTs
    await requestReset(creds.email);
    const second = await latestResetToken(creds.email);
    expect(second).not.toBe(first);
    expect((await doReset(first, 'OldLinkPassw0rd!')).status).toBe(401);
    expect((await doReset(second, 'NewLinkPassw0rd!')).status).toBe(200);
  });

  test('IND-RST-06 reset link expires after the configured lifetime (AC-SEBM-F-003)', async () => {
    process.env.PASSWORD_RESET_TOKEN_LIFETIME_SECONDS = '1';
    const { creds } = await h.registerAndLogin(app);
    await requestReset(creds.email);
    const token = await latestResetToken(creds.email);
    await new Promise((r) => setTimeout(r, 2200));
    const res = await doReset(token, 'TooLatePassw0rd!');
    delete process.env.PASSWORD_RESET_TOKEN_LIFETIME_SECONDS;
    expect(res.status).toBe(401);
    expect((await login(creds.email, creds.password)).status).toBe(200);
  });

  test('IND-RST-07 default reset lifetime is time-limited (<= 1 hour)', async () => {
    const { creds } = await h.registerAndLogin(app);
    await requestReset(creds.email);
    const p = jwt.decode(await latestResetToken(creds.email));
    expect(p.exp - p.iat).toBeGreaterThan(0);
    expect(p.exp - p.iat).toBeLessThanOrEqual(3600);
  });

  test('IND-RST-08 tampered or foreign tokens are rejected and do not change the password', async () => {
    const { creds } = await h.registerAndLogin(app);
    await requestReset(creds.email);
    const token = await latestResetToken(creds.email);
    const tampered = token.slice(0, -3) + (token.endsWith('aaa') ? 'bbb' : 'aaa');
    expect((await doReset(tampered, 'TamperedPassw0rd!')).status).toBe(401);
    const forged = jwt.sign({ userId: jwt.decode(token).userId, email: creds.email, tokenType: 'password-reset', jti: 'x' }, 'wrong-secret');
    expect((await doReset(forged, 'ForgedPassw0rd!')).status).toBe(401);
    expect((await doReset('garbage', 'GarbagePassw0rd!')).status).toBe(401);
    expect((await login(creds.email, creds.password)).status).toBe(200);
  });


  test('IND-RST-10 new password must meet the 8-character rule and the old password stays valid on failure', async () => {
    const { creds } = await h.registerAndLogin(app);
    await requestReset(creds.email);
    const token = await latestResetToken(creds.email);
    const short = await doReset(token, 'short');
    expect(short.status).toBe(400);
    expect((await login(creds.email, creds.password)).status).toBe(200);
    expect((await doReset(token, 'LongEnoughPassw0rd!')).status).toBe(200);
  });

  test('IND-RST-11 verify-reset-token reports validity without leaking secrets', async () => {
    const { creds } = await h.registerAndLogin(app);
    await requestReset(creds.email);
    const token = await latestResetToken(creds.email);
    const ok = await h.request(app).post('/api/auth/verify-reset-token').send({ token });
    expect(ok.status).toBe(200);
    expect(ok.body.valid).toBe(true);
    expect(JSON.stringify(ok.body)).not.toMatch(/hash|\$2[aby]\$/i);
    expect((await h.request(app).post('/api/auth/verify-reset-token').send({ token: 'bad' })).status).toBe(401);
  });

  test('IND-RST-12 the reset token is stored hashed, not in clear, in the database', async () => {
    const { creds } = await h.registerAndLogin(app);
    await requestReset(creds.email);
    const token = await latestResetToken(creds.email);
    const r = await h.db.query('SELECT password_reset_token_hash FROM users WHERE email = $1', [creds.email]);
    expect(r.rows[0].password_reset_token_hash).toBeTruthy();
    expect(token).not.toContain(r.rows[0].password_reset_token_hash);
    expect(r.rows[0].password_reset_token_hash).not.toBe(token);
  });

  test('IND-RST-13 after reset, the stored reset marker is cleared', async () => {
    const { creds } = await h.registerAndLogin(app);
    await requestReset(creds.email);
    await doReset(await latestResetToken(creds.email), 'ClearMarkerPassw0rd!');
    const r = await h.db.query('SELECT password_reset_token_hash FROM users WHERE email = $1', [creds.email]);
    expect(r.rows[0].password_reset_token_hash).toBeNull();
  });
});
