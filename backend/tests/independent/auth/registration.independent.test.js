/**
 * Independent verification - S1-01 Registration (SEBM-F-001, SEBM-SR-002)
 * Tester: Dev A (Taran S). Module owner: Dev B. Black-box, real HTTP + real PostgreSQL.
 * Acceptance criteria used:
 *  AC-SEBM-F-001: registration succeeds with a unique, valid email and a password meeting complexity rules.
 *  AC-SEBM-SR-002: database inspection confirms no plaintext or reversibly-encrypted passwords.
 */
const bcrypt = require('bcryptjs');
const h = require('./helpers/harness');

let app;
beforeAll(async () => { await h.migrate(); app = h.getApp(); });
afterAll(async () => { await h.cleanupIndependentUsers(); await h.db.closePool(); });

describe('S1-01 registration (SEBM-F-001)', () => {
  test('IND-REG-01 valid registration returns 201 and a user without any password data', async () => {
    const { res, body } = await h.register(app);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(body.email);
    expect(res.body.user.role).toBe('user');
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash|\$2[aby]\$/i);
  });

  test('IND-REG-02 registered user exists in the database with role user', async () => {
    const { body } = await h.register(app);
    const r = await h.db.query('SELECT name, email, role FROM users WHERE email = $1', [body.email]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].role).toBe('user');
  });

  test('IND-REG-03 duplicate email is rejected with 409 and creates no second row', async () => {
    const { body } = await h.register(app);
    const again = await h.request(app).post('/api/auth/register').send(body);
    expect(again.status).toBe(409);
    const r = await h.db.query('SELECT count(*)::int AS n FROM users WHERE email = $1', [body.email]);
    expect(r.rows[0].n).toBe(1);
  });

  test('IND-REG-04 duplicate email differing only by case or surrounding spaces is rejected', async () => {
    const { body } = await h.register(app);
    const res = await h.request(app).post('/api/auth/register').send({ ...body, email: `  ${body.email.toUpperCase()} ` });
    expect(res.status).toBe(409);
  });

  test.each([
    ['missing name', { name: undefined }],
    ['blank name', { name: '   ' }],
    ['missing email', { email: undefined }],
    ['email without @', { email: 'not-an-email' }],
    ['email without domain dot', { email: 'a@b' }],
    ['missing password', { password: undefined }],
    ['password of 7 characters', { password: 'Abcde12' }],
    ['non-string password', { password: 12345678 }],
    ['non-string email', { email: { $ne: null } }],
  ])('IND-REG-05 rejects %s with 400 and stores nothing', async (_label, patch) => {
    const email = h.uniqueEmail('inv');
    const payload = { name: 'Ind Tester', email, password: 'Str0ngPassw0rd!', ...patch };
    const res = await h.request(app).post('/api/auth/register').send(payload);
    expect(res.status).toBe(400);
    const r = await h.db.query('SELECT 1 FROM users WHERE email = $1', [email]);
    expect(r.rows).toHaveLength(0);
  });

  test('IND-REG-06 email is stored normalised (lower-case, trimmed)', async () => {
    const email = h.uniqueEmail('norm');
    const res = await h.request(app).post('/api/auth/register').send({ name: 'N', email: `  ${email.toUpperCase()}  `, password: 'Str0ngPassw0rd!' });
    expect(res.status).toBe(201);
    const r = await h.db.query('SELECT email FROM users WHERE email = $1', [email]);
    expect(r.rows).toHaveLength(1);
  });

  test('IND-REG-07 client cannot choose their own role (mass assignment)', async () => {
    const { res, body } = await h.register(app, { role: 'admin', user_id: 'attacker-chosen-id' });
    expect(res.status).toBe(201);
    const r = await h.db.query('SELECT user_id, role FROM users WHERE email = $1', [body.email]);
    expect(r.rows[0].role).toBe('user');
    expect(r.rows[0].user_id).not.toBe('attacker-chosen-id');
  });

  test('IND-REG-08 SQL-injection style input is stored literally and does not damage the users table', async () => {
    const name = "Robert'); DROP TABLE users;--";
    const { res, body } = await h.register(app, { name });
    expect(res.status).toBe(201);
    const r = await h.db.query('SELECT name FROM users WHERE email = $1', [body.email]);
    expect(r.rows[0].name).toBe(name);
  });


});

describe('S1-01 password storage (SEBM-SR-002)', () => {
  test('IND-SEC-01 stored value is a bcrypt hash, not the plaintext', async () => {
    const { body } = await h.register(app);
    const r = await h.db.query('SELECT password_hash FROM users WHERE email = $1', [body.email]);
    const stored = r.rows[0].password_hash;
    expect(stored).not.toBe(body.password);
    expect(stored).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(await bcrypt.compare(body.password, stored)).toBe(true);
  });

  test('IND-SEC-02 same password for two users gives two different hashes (salted)', async () => {
    const pw = 'SamePassw0rd!';
    const a = await h.register(app, { password: pw });
    const b = await h.register(app, { password: pw });
    const r = await h.db.query('SELECT password_hash FROM users WHERE email = ANY($1)', [[a.body.email, b.body.email]]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].password_hash).not.toBe(r.rows[1].password_hash);
  });

  test('IND-SEC-03 bcrypt cost factor is at least 10', async () => {
    const { body } = await h.register(app);
    const r = await h.db.query('SELECT password_hash FROM users WHERE email = $1', [body.email]);
    expect(bcrypt.getRounds(r.rows[0].password_hash)).toBeGreaterThanOrEqual(10);
  });
});
