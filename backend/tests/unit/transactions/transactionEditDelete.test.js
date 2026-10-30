jest.mock('../../../src/budgets', () => ({ checkThreshold: jest.fn().mockResolvedValue(undefined) }));

const { checkThreshold } = require('../../../src/budgets');
const TransactionService = require('../../../src/transactions/transactionService');

const stored = (overrides = {}) => ({
  transactionId: 't1',
  accountId: 'a1',
  categoryId: 'c1',
  amount: 10,
  type: 'expense',
  date: '2026-10-20',
  notes: null,
  createdAt: '2026-10-20T10:00:00.000Z',
  ...overrides,
});

const input = { accountId: 'a1', categoryId: 'c2', amount: 12.5, type: 'Expense', date: '2026-10-21', notes: ' hi ' };

describe('TransactionService edit and delete (SEBM-F-011, TC-Exp-02)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('validates input, delegates to the repository and refreshes budget thresholds', async () => {
    const repository = {
      updateAndAdjustBalance: jest.fn().mockResolvedValue({
        previous: stored(),
        transaction: stored({ categoryId: 'c2', amount: 12.5, date: '2026-10-21', notes: 'hi' }),
        newBalance: 87.5,
        previousAccountBalance: 87.5,
      }),
    };
    const service = new TransactionService(repository);

    const result = await service.updateTransaction('u1', ' t1 ', input);

    expect(repository.updateAndAdjustBalance).toHaveBeenCalledWith({
      userId: 'u1', transactionId: 't1', accountId: 'a1', categoryId: 'c2', amount: 12.5,
      type: 'expense', date: '2026-10-21', notes: 'hi',
    });
    expect(result).toMatchObject({ transactionId: 't1', amount: 12.5, newBalance: 87.5 });
    expect(result.previousAccountId).toBeUndefined();
    expect(checkThreshold).toHaveBeenCalledTimes(2);
    expect(checkThreshold).toHaveBeenCalledWith('u1', 'c1', '2026-10-20');
    expect(checkThreshold).toHaveBeenCalledWith('u1', 'c2', '2026-10-21');
  });

  it('reports the previous account balance when the transaction moves accounts', async () => {
    const repository = {
      updateAndAdjustBalance: jest.fn().mockResolvedValue({
        previous: stored(),
        transaction: stored({ accountId: 'a2' }),
        newBalance: 40,
        previousAccountBalance: 110,
      }),
    };
    const result = await new TransactionService(repository).updateTransaction('u1', 't1', { ...input, accountId: 'a2' });
    expect(result).toMatchObject({ accountId: 'a2', previousAccountId: 'a1', previousAccountBalance: 110 });
  });

  it('rejects invalid edits before touching the repository', async () => {
    const repository = { updateAndAdjustBalance: jest.fn() };
    const service = new TransactionService(repository);

    await expect(service.updateTransaction('u1', 't1', { ...input, amount: 0 })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.updateTransaction('u1', 't1', { ...input, amount: 1.234 })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.updateTransaction('u1', 't1', { ...input, date: '2026-02-30' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.updateTransaction('u1', 't1', { ...input, type: 'transfer' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.updateTransaction('u1', '  ', input)).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.updateAndAdjustBalance).not.toHaveBeenCalled();
  });

  it('does not fail the edit when the budget check throws', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    checkThreshold.mockRejectedValueOnce(new Error('boom'));
    const repository = {
      updateAndAdjustBalance: jest.fn().mockResolvedValue({
        previous: stored(), transaction: stored(), newBalance: 1, previousAccountBalance: 1,
      }),
    };
    await expect(new TransactionService(repository).updateTransaction('u1', 't1', input)).resolves.toBeDefined();
    console.error.mockRestore();
  });

  it('deletes through the repository and re-checks the budget only for expenses', async () => {
    const repository = {
      deleteAndReverseBalance: jest.fn()
        .mockResolvedValueOnce({ transaction: stored(), newBalance: 100 })
        .mockResolvedValueOnce({ transaction: stored({ type: 'income' }), newBalance: 90 }),
    };
    const service = new TransactionService(repository);

    await expect(service.deleteTransaction('u1', 't1')).resolves.toEqual({
      transactionId: 't1', accountId: 'a1', newBalance: 100,
    });
    expect(checkThreshold).toHaveBeenCalledTimes(1);
    await service.deleteTransaction('u1', 't1');
    expect(checkThreshold).toHaveBeenCalledTimes(1);
    expect(repository.deleteAndReverseBalance).toHaveBeenCalledWith({ userId: 'u1', transactionId: 't1' });
  });
});
