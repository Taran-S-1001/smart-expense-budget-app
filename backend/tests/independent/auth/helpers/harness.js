/**
 * Harness for independent black-box Auth tests (Dev A testing Dev B's module).
 * - Uses the REAL app and a REAL PostgreSQL database (DATABASE_URL, normally sebm_test).
 *   Nothing in src/ is mocked, unlike the owner's unit/integration tests which mock db.query().
 * - Applies the repo's migrations, and removes only the rows each test file creates.
 */
const request = require('supertest');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'independent-test-secret';

const db = require('../../../../src/db');
const config = require('../../../../src/config');

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let counter = 0;
const uniqueEmail = (label = 'u') => `ind-${label}-${runId}-${counter++}@example.com`;

async function migrate() {
  const { execFileSync } = require('child_process');
  execFileSync('node', ['src/db/migrate.js'], { cwd: require('path').join(__dirname, '..', '..', '..', '..'), stdio: 'ignore' });
}

const getApp = () => require('../../../../src/app');

async function register(app, overrides = {}) {
  const body = { name: 'Ind Tester', email: uniqueEmail(), password: 'Str0ngPassw0rd!', ...overrides };
  const res = await request(app).post('/api/auth/register').send(body);
  return { res, body };
}

async function registerAndLogin(app, overrides = {}) {
  const { body } = await register(app, overrides);
  const res = await request(app).post('/api/auth/login').send({ email: body.email, password: body.password });
  return { res, creds: body };
}

async function cleanupIndependentUsers() {
  await db.query("DELETE FROM notifications WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE $1)", [`ind-%-${runId}-%@example.com`]).catch(() => {});
  await db.query('DELETE FROM users WHERE email LIKE $1', [`ind-%-${runId}-%@example.com`]);
}

module.exports = { request, db, config, runId, uniqueEmail, migrate, getApp, register, registerAndLogin, cleanupIndependentUsers };
