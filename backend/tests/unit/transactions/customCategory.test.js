const TransactionService = require('../../../src/transactions/transactionService');

describe('TransactionService custom categories (SEBM-F-013, TC-Exp-04)', () => {
  it('creates a custom category for the authenticated user with a trimmed name', async () => {
    const repository = {
      createCustomCategory: jest.fn().mockResolvedValue({ categoryId: 'c1', name: 'Pets', type: 'expense' }),
    };
    const service = new TransactionService(repository);

    await expect(service.createCategory('user-1', { name: '  Pets  ', type: 'Expense', userId: 'user-2' }))
      .resolves.toEqual({ categoryId: 'c1', name: 'Pets', type: 'expense' });

    expect(repository.createCustomCategory).toHaveBeenCalledWith({
      userId: 'user-1',
      name: 'Pets',
      type: 'expense',
    });
  });

  it.each([
    [{ name: '', type: 'expense' }],
    [{ name: '   ', type: 'expense' }],
    [{ type: 'expense' }],
    [{ name: 'x'.repeat(101), type: 'expense' }],
    [{ name: 'Pets', type: 'transfer' }],
    [{ name: 'Pets' }],
    [{ name: 123, type: 'expense' }],
  ])('rejects invalid category input %#', async (input) => {
    const repository = { createCustomCategory: jest.fn() };
    const service = new TransactionService(repository);

    await expect(service.createCategory('user-1', input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
    expect(repository.createCustomCategory).not.toHaveBeenCalled();
  });

  it('accepts a name of exactly 100 characters', async () => {
    const repository = { createCustomCategory: jest.fn().mockResolvedValue({}) };
    const service = new TransactionService(repository);

    await service.createCategory('user-1', { name: 'x'.repeat(100), type: 'income' });
    expect(repository.createCustomCategory).toHaveBeenCalled();
  });
});
