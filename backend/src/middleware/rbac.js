const normalizeRole = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const requireRole = (requiredRole) => (req, res, next) => {
  const roleName = normalizeRole(requiredRole);
  const userRole = normalizeRole(req.user && req.user.role);

  if (!req.user || !userRole) {
    return res.status(401).json({
      error: {
        code: 'MISSING_AUTHORIZATION',
        message: 'Authentication required.',
      },
    });
  }

  if (userRole !== roleName.toLowerCase()) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: `Role '${requiredRole}' is required.`,
      },
    });
  }

  return next();
};

module.exports = {
  requireRole,
  normalizeRole,
};
