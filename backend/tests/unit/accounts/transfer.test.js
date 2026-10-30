const AccountService = require('../../../src/accounts/accountService');
const AccountRepository = require('../../../src/accounts/accountRepository');

describe('AccountService.transfer (SEBM-F-031, TC-Acc-02)', () => {
  const valid = { fromAccountId: 'a1', toAccountId: 'a2', amount: 25.5 };

  it('validates input and uses the authenticated user ID', async () => {
    const repository = { transfer: jest.fn().mockResolvedValue({ transferId: 't1' }) };
    const service = new AccountService(repository);

    await expect(service.transfer('user-1', { ...valid, userId: 'user-2' })).resolves.toEqual({ transferId: 't1' });
    expect(repository.transfer).toHaveBeenCalledWith({
      userId: 'user-1',
      fromAccountId: 'a1',
      toAccountId: 'a2',
      amount: 25.5,
    });
  });

  it.each([
    [{ ...valid, fromAccountId: '' }],
    [{ ...valid, toAccountId: undefined }],
    [{ ...valid, toAccountId: 'a1' }],
    [{ ...valid, amount: 0 }],
    [{ ...valid, amount: -5 }],
    [{ ...valid, amount: 'abc' }],
    [{ ...valid, amount: 1.234 }],
    [{ fromAccountId: 'a1', toAccountId: 'a2' }],
  ])('rejects invalid transfer input %#', async (input) => {
    const repository = { transfer: jest.fn() };
    const service = new AccountService(repository);

    await expect(service.transfer('user-1', input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
    expect(repository.transfer).not.toHaveBeenCalled();
  });
});

describe('AccountRepository.transfer (SEBM-F-031, TC-Acc-02)', () => {
  const buildClient = (responses) => {
    const client = {
      query: jest.fn(async (sql) => {
        const next = responses.shift();
        if (next instanceof Error) throw next;
        return next || { rows: [] };
      }),
      release: jest.fn(),
    };
    return client;
  };
  const input = { userId: 'u1', fromAccountId: 'a1', toAccountId: 'a2', amount: 40 };

  it('debits, credits and records the transfer in one database transaction', async () => {
    const client = buildClient([
      {}, // BEGIN
      { rows: [{ account_id: 'a1', balance: '100.00' }, { account_id: 'a2', balance: '10.00' }] },
      { rows: [{ balance: '60.00' }] },
      { rows: [{ balance: '50.00' }] },
      { rows: [{ transfer_id: 'tr-1' }] },
      {}, // COMMIT
    ]);
    const repository = new AccountRepository({ getClient: async () => client });

    await expect(repository.transfer(input)).resolves.toEqual({
      transferId: 'tr-1',
      fromAccountBalance: 60,
      toAccountBalance: 50,
    });
    const sql = client.query.mock.calls.map((c) => c[0].replace(/\s+/g, ' ').trim());
    expect(sql[0]).toBe('BEGIN');
    expect(sql[1]).toContain('FOR UPDATE');
    expect(sql[sql.length - 1]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rejects an insufficient balance and rolls back without changing balances', async () => {
    const client = buildClient([
      {},
      { rows: [{ account_id: 'a1', balance: '39.99' }, { account_id: 'a2', balance: '10.00' }] },
    ]);
    const repository = new AccountRepository({ getClient: async () => client });

    await expect(repository.transfer(input)).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS', statusCode: 422 });
    const sql = client.query.mock.calls.map((c) => c[0].replace(/\s+/g, ' ').trim());
    expect(sql.some((q) => q.startsWith('UPDATE'))).toBe(false);
    expect(sql[sql.length - 1]).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('allows transferring exactly the full source balance', async () => {
    const client = buildClient([
      {},
      { rows: [{ account_id: 'a1', balance: '40.00' }, { account_id: 'a2', balance: '0.00' }] },
      { rows: [{ balance: '0.00' }] },
      { rows: [{ balance: '40.00' }] },
      { rows: [{ transfer_id: 'tr-2' }] },
      {},
    ]);
    const repository = new AccountRepository({ getClient: async () => client });

    await expect(repository.transfer(input)).resolves.toMatchObject({ fromAccountBalance: 0, toAccountBalance: 40 });
  });

  it('returns 404 when either account is missing or not owned, and rolls back', async () => {
    const client = buildClient([{}, { rows: [{ account_id: 'a1', balance: '100.00' }] }]);
    const repository = new AccountRepository({ getClient: async () => client });

    await expect(repository.transfer(input)).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND', statusCode: 404 });
    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });

  it('rolls back when a later statement fails', async () => {
    const client = buildClient([
      {},
      { rows: [{ account_id: 'a1', balance: '100.00' }, { account_id: 'a2', balance: '10.00' }] },
      { rows: [{ balance: '60.00' }] },
      new Error('credit failed'),
    ]);
    const repository = new AccountRepository({ getClient: async () => client });

    await expect(repository.transfer(input)).rejects.toThrow('credit failed');
    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
