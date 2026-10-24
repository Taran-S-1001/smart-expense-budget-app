const errorHandler = require('./errorHandler');
const notFoundHandler = require('./notFoundHandler');
const securityHeaders = require('./securityHeaders');
const httpsEnforcer = require('./httpsEnforcer');

module.exports = {
  errorHandler,
  notFoundHandler,
  securityHeaders,
  httpsEnforcer,
};
