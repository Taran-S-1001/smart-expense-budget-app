const { requireRole } = require('../../src/middleware/rbac');

describe('RBAC middleware', () => {
  it('allows access for the required admin role', () => {
    const req = { user: { role: 'Admin' } };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();

    requireRole('Admin')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects requests when the authenticated user is not an admin', () => {
    const req = { user: { role: 'user' } };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();

    requireRole('Admin')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'FORBIDDEN',
        message: "Role 'Admin' is required.",
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
