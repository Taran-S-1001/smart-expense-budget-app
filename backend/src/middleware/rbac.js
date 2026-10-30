/**
 * Role-Based Access Control (RBAC) middleware for SEBM.
 * Requirement: SEBM-SR-005 (Issue #28, Story S2-03, Test Case TC-Sec-06).
 *
 * Enforces role restrictions on protected endpoints.
 * Assumes authenticateToken runs before requireRole to populate req.user.
 */

const normalizeRole = (role) => {
  if (typeof role !== 'string') return null;
  const trimmed = role.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
};

const requireRole = (requiredRole) => {
  const allowedRoles = (Array.isArray(requiredRole) ? requiredRole : [requiredRole])
    .map(normalizeRole)
    .filter(Boolean);

  return (req, res, next) => {
    if (!req.user || typeof req.user !== 'object' || typeof req.user.role !== 'string') {
      return res.status(401).json({
        error: {
          code: 'MISSING_AUTHORIZATION',
          message: 'Authentication required.',
        },
      });
    }

    const userRole = normalizeRole(req.user.role);

    if (allowedRoles.length === 0 || !userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: insufficient permissions.',
        },
      });
    }

    return next();
  };
};

module.exports = {
  requireRole,
  normalizeRole,
};
