const request = require('supertest');
const app = require('../../src/app');
const { resetStore } = require('../../src/store');

describe('Accounts API', () => {
  beforeEach(() => {
    resetStore();
  });

  it('creates, lists and transfers funds between accounts', async () => {
    const createResponse = await request(app)
      .post('/api/accounts')
      .send({
        user_id: 'user_2',
        account_type: 'checking',
        account_name: 'Travel wallet',
        balance: 500,
      })
      .expect(201);

    expect(createResponse.body.account_name).toBe('Travel wallet');

    const listResponse = await request(app)
      .get('/api/accounts?user_id=user_2')
      .expect(200);

    expect(listResponse.body.some((account) => account.account_name === 'Travel wallet')).toBe(true);

    const transferResponse = await request(app)
      .post('/api/accounts/transfer')
      .send({
        from_account_id: 'acc_1',
        to_account_id: createResponse.body.account_id,
        amount: 100,
      })
      .expect(200);

    expect(transferResponse.body.amount).toBe(100);
    expect(transferResponse.body.from_account.balance).toBe(2400);
    expect(transferResponse.body.to_account.balance).toBe(600);
  });
});
