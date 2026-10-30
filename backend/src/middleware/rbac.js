<<<<<<< HEAD
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
=======
/**
 * Role-Based Access Control (RBAC) middleware for SEBM.
 * Requirement: SEBM-SR-005 (Issue #28, Story S2-03, Test Case TC-Sec-06).
 *
 * Enforces role restrictions on protected endpoints.
 * Assumes authenticateToken is executed prior to requireRole to populate req.user.
 */

const normalizeRole = (role) => {
  if (typeof role !== 'string') return null;
  const trimmed = role.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
};

/**
 * Returns an Express middleware that checks if the authenticated user possesses the required role.
 *
 * @param {string|string[]} requiredRole - The role or array of roles required to access the endpoint (case-insensitive).
 * @returns {Function} Express middleware (req, res, next)
 */
const requireRole = (requiredRole) => {
  const allowedRoles = (
    Array.isArray(requiredRole)
      ? requiredRole.map(normalizeRole).filter(Boolean)
      : [normalizeRole(requiredRole)].filter(Boolean)
  );

  return (req, res, next) => {
    // Missing authenticated user context -> 401 Unauthorized
    if (!req.user || typeof req.user !== 'object' || typeof req.user.role !== 'string') {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
    }

    const userRole = normalizeRole(req.user.role);

    // Fail closed: if configuration is invalid (no valid role specified) or user lacks required role -> 403 Forbidden
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

module.exports = requireRole;
module.exports.requireRole = requireRole;
module.exports.normalizeRole = normalizeRole;
>>>>>>> 2e145fc3ca6a17eafe3537dcae03f37aa005c93a
