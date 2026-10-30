const errorHandler = require('./errorHandler');
const notFoundHandler = require('./notFoundHandler');
const securityHeaders = require('./securityHeaders');
const httpsEnforcer = require('./httpsEnforcer');
const { requireRole } = require('./rbac');

module.exports = {
  errorHandler,
  notFoundHandler,
  securityHeaders,
  httpsEnforcer,
  requireRole,
};
