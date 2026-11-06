/**
 * KNOWN DEFECTS (Auth). Not part of the independent verification of any story.
 *
 * Each case states the CORRECT behaviour and is wrapped in test.failing, so it passes only while the defect exists
 * and turns red once the defect is fixed. When a defect is fixed, delete .failing and move the case into the
 * matching suite under tests/independent/. A green run here means "the defect is still present", not "requirement met".
 * Run with: cd backend && npx jest tests/known-defects --runInBand (CI runs it as a separate, clearly labelled step).
 *
 * Tracking: see the "Known defects" table in the PR description (one row per BUG-AUTH id below).
 */
const h = require('../../independent/auth/helpers/harness');

let app; let admin;
beforeAll(async () => {
  await h.migrate(); app = h.getApp();
  const email = h.uniqueEmail('kdadm');
  await h.register(app, { email });
  await h.db.query("UPDATE users SET role='admin' WHERE email=$1", [email]);
  admin = (await h.request(app).post('/api/auth/login').send({ email, password: 'Str0ngPassw0rd!' })).body.token;
});
afterAll(async () => {
  await h.cleanupIndependentUsers();
  await h.db.query('DELETE FROM categories WHERE user_id IS NULL AND name LIKE $1', [`KD %${h.runId}%`]);
  await h.db.closePool();
});

describe('Known defects - expected to fail until fixed', () => {
  test.failing('BUG-AUTH-02 (was IND-REG-09) very long input does not cause a 500', async () => {
    const res = await h.request(app).post('/api/auth/register').send({ name: 'x'.repeat(300), email: h.uniqueEmail('long'), password: 'Str0ngPassw0rd!' });
    expect(res.status).toBeLessThan(500);
  });

  // Skipped on purpose: this defect is intermittent. In 5 local rounds of 3 simultaneous registrations, each round
  // left exactly one user row, but 3 rounds returned [201, 500, 500] and 2 returned [201, 409, 409]. Other machines or
  // CI runners may differ. A test.failing case would flip red whenever a round happens to be clean, so it is skipped
  // until a deterministic reproducer exists. Correct behaviour: one user created, the others rejected with 409.
  test.skip('BUG-AUTH-03 (was IND-REG-10) simultaneous registrations of the same email create one user and none returns 500 [intermittent, skipped]', async () => {
    const email = h.uniqueEmail('race');
    const send = () => h.request(app).post('/api/auth/register').send({ name: 'R', email, password: 'Str0ngPassw0rd!' });
    const results = await Promise.all([send(), send(), send()]);
    const r = await h.db.query('SELECT count(*)::int AS n FROM users WHERE email = $1', [email]);
    expect(r.rows[0].n).toBe(1);
    expect(results.filter((x) => x.status === 201)).toHaveLength(1);
    expect(results.filter((x) => x.status >= 500)).toHaveLength(0);
  });

  test.failing('BUG-AUTH-04 (was IND-ADM-16) very long category name does not cause a 500', async () => {
    const before = (await h.db.query('SELECT count(*)::int n FROM categories')).rows[0].n;
    const res = await h.request(app).post('/api/admin/categories').set({ Authorization: `Bearer ${admin}` }).send({ name: 'KD ' + h.runId + 'x'.repeat(200), type: 'expense' });
    expect(res.status).toBeLessThan(500);
    expect((await h.db.query('SELECT count(*)::int n FROM categories')).rows[0].n).toBeGreaterThanOrEqual(before);
  });

  test.failing('BUG-AUTH-05 (was IND-RST-03b) password-reset request with an array instead of an email string returns 400', async () => {
    const res = await h.request(app).post('/api/auth/forgot-password').send({ email: ['a@b.co'] });
    expect(res.status).toBe(400);
  });

  test.failing('BUG-AUTH-06 (was IND-RST-09) a normal login access token cannot be used as a reset token', async () => {
    const { res, creds } = await h.registerAndLogin(app);
    const r = await h.request(app).post('/api/auth/reset-password').send({ token: res.body.token, newPassword: 'EscalatePassw0rd!' });
    expect(r.status).toBe(401);
    expect((await h.request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password })).status).toBe(200);
  });
});
