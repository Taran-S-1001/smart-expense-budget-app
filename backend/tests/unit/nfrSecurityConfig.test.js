const { parseDbSsl, validateProductionSecurity } = require('../../src/config');

describe('NFR production transport-security configuration', () => {
  describe('parseDbSsl', () => {
    it('disables PostgreSQL TLS only when DB_SSL is not enabled', () => {
      expect(parseDbSsl(undefined)).toBe(false);
      expect(parseDbSsl('false')).toBe(false);
    });

    it('verifies PostgreSQL certificates by default when TLS is enabled', () => {
      expect(parseDbSsl('true')).toEqual({ rejectUnauthorized: true });
    });

    it('allows explicitly disabling certificate verification for a local self-signed development database', () => {
      expect(parseDbSsl('true', 'false')).toEqual({ rejectUnauthorized: false });
    });
  });

  describe('validateProductionSecurity', () => {
    const secureProxyEnvironment = {
      NODE_ENV: 'production',
      DB_SSL: 'true',
      DB_SSL_REJECT_UNAUTHORIZED: 'true',
      TLS_ENABLED: 'false',
      ENFORCE_HTTPS: 'true',
      TRUST_PROXY: '1',
    };

    it('does not impose production requirements in development or tests', () => {
      expect(validateProductionSecurity({ NODE_ENV: 'test' })).toBe(true);
      expect(validateProductionSecurity({ NODE_ENV: 'development' })).toBe(true);
    });

    it('accepts verified PostgreSQL TLS behind a trusted HTTPS proxy', () => {
      expect(validateProductionSecurity(secureProxyEnvironment)).toBe(true);
    });

    it('accepts HTTPS terminated directly by Node.js', () => {
      expect(validateProductionSecurity({
        ...secureProxyEnvironment,
        TLS_ENABLED: 'true',
        ENFORCE_HTTPS: 'false',
        TRUST_PROXY: 'false',
      })).toBe(true);
    });

    it('rejects production when PostgreSQL TLS or certificate verification is disabled', () => {
      expect(() => validateProductionSecurity({
        ...secureProxyEnvironment,
        DB_SSL: 'false',
      })).toThrow(/DB_SSL=true/);

      expect(() => validateProductionSecurity({
        ...secureProxyEnvironment,
        DB_SSL_REJECT_UNAUTHORIZED: 'false',
      })).toThrow(/DB_SSL=true/);
    });

    it('rejects production when application HTTPS is not configured', () => {
      expect(() => validateProductionSecurity({
        ...secureProxyEnvironment,
        ENFORCE_HTTPS: 'false',
      })).toThrow(/TLS_ENABLED=true or enforce HTTPS/);
    });

    it('rejects proxy HTTPS configuration without an explicit trusted proxy', () => {
      expect(() => validateProductionSecurity({
        ...secureProxyEnvironment,
        TRUST_PROXY: 'false',
      })).toThrow(/explicit TRUST_PROXY/);
    });
  });
});
