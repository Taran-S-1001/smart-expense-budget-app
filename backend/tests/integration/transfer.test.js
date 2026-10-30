jest.mock('../../src/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const config = require('../../src/config');
const db = require('../../src/db');
const { signTestToken } = require('../../src/auth/jwt');

const TEST_SECRET = 'transfer-integration-test-secret';
const originalJwtSecret = config.jwtSecret;
const authorization = () => `Bearer ${signTestToken('user-123', 'User')}`;

describe('Account transfer API (SEBM-F-031, TC-Acc-02)', () => {
  beforeAll(() => {
    config.jwtSecret = TEST_SECRET;
  });

  afterAll(() => {
    config.jwtSecret = originalJwtSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockClient = (responses) => {
    const client = {
      query: jest.fn(async () => responses.shift() || { rows: [] }),
      release: jest.fn(),
    };
    db.getClient.mockResolvedValue(client);
    return client;
  };

  it('debits the source, credits the destination and returns the transfer record', async () => {
    mockClient([
      {},
      { rows: [{ account_id: 'a1', balance: '100.00' }, { account_id: 'a2', balance: '5.00' }] },
      { rows: [{ balance: '75.00' }] },
      { rows: [{ balance: '30.00' }] },
      { rows: [{ transfer_id: 'transfer-1' }] },
      {},
    ]);

    const response = await request(app)
      .post('/api/accounts/transfer')
      .set('Authorization', authorization())
      .send({ fromAccountId: 'a1', toAccountId: 'a2', amount: 25 })
      .expect(201);

    expect(response.body).toEqual({
      transferId: 'transfer-1',
      fromAccountBalance: 75,
      toAccountBalance: 30,
    });
  });

  it('rejects a transfer when the source balance is insufficient', async () => {
    const client = mockClient([
      {},
      { rows: [{ account_id: 'a1', balance: '10.00' }, { account_id: 'a2', balance: '5.00' }] },
    ]);

    const response = await request(app)
      .post('/api/accounts/transfer')
      .set('Authorization', authorization())
      .send({ fromAccountId: 'a1', toAccountId: 'a2', amount: 25 })
      .expect(422);

    expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });

  it('rejects a transfer to the same account and invalid amounts with 400', async () => {
    await request(app).post('/api/accounts/transfer').set('Authorization', authorization())
      .send({ fromAccountId: 'a1', toAccountId: 'a1', amount: 5 }).expect(400);
    await request(app).post('/api/accounts/transfer').set('Authorization', authorization())
      .send({ fromAccountId: 'a1', toAccountId: 'a2', amount: -5 }).expect(400);
    expect(db.getClient).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    await request(app).post('/api/accounts/transfer').send({ fromAccountId: 'a1', toAccountId: 'a2', amount: 5 }).expect(401);
  });
});
