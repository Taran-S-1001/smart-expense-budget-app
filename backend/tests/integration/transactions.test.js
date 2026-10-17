const request = require('supertest');
const app = require('../../src/app');
const { resetStore } = require('../../src/store');

describe('Transactions API', () => {
  beforeEach(() => {
    resetStore();
  });

  it('creates and updates a transaction while keeping balances in sync', async () => {
    const createResponse = await request(app)
      .post('/api/transactions')
      .send({
        account_id: 'acc_1',
        category_id: 'cat_1',
        amount: 75,
        date: '2026-10-18',
        type: 'Expense',
        notes: 'Coffee and lunch',
      })
      .expect(201);

    expect(createResponse.body.type).toBe('Expense');
    expect(createResponse.body.amount).toBe(75);

    const accountResponse = await request(app)
      .get('/api/accounts/acc_1')
      .expect(200);

    expect(accountResponse.body.balance).toBe(2425);

    const updateResponse = await request(app)
      .put(`/api/transactions/${createResponse.body.transaction_id}`)
      .send({
        amount: 90,
        type: 'Expense',
        notes: 'Team lunch',
      })
      .expect(200);

    expect(updateResponse.body.amount).toBe(90);

    const accountAfterUpdate = await request(app)
      .get('/api/accounts/acc_1')
      .expect(200);

    expect(accountAfterUpdate.body.balance).toBe(2410);
  });
});
