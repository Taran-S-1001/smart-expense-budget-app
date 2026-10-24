const config = require('../../src/config');
const { getPoolConfig } = require('../../src/db');
const { validateTlsFiles } = require('../../src/server');

describe('Configuration & DB Config (Unit)', () => {
  it('loads default server configuration', () => {
    expect(config.port).toBeDefined();
    expect(typeof config.port).toBe('number');
    expect(config.nodeEnv).toBeDefined();
  });

  it('provides default security, TLS, and proxy settings', () => {
    expect(config.tls).toBeDefined();
    expect(config.tls.enabled).toBe(false);
    expect(config.tls.minVersion).toBe('TLSv1.2');
    expect(config.trustProxy).toBe(false);
    expect(config.enforceHttps).toBe(false);
    expect(config.hstsIncludeSubdomains).toBe(false);
  });

  it('provides default PostgreSQL connection settings', () => {
    expect(config.db).toBeDefined();
    expect(config.db.host).toBeDefined();
    expect(config.db.port).toBe(5432);
    expect(config.db.database).toBe('sebm');
    expect(config.db.user).toBe('sebm');
    expect(config.db.password).toBe('sebm_dev_password');
    expect(config.db.max).toBe(10);
  });

  it('constructs database pool config correctly with overrides', () => {
    const customConfig = getPoolConfig({ max: 5 });
    expect(customConfig.max).toBe(5);
    expect(customConfig.database).toBe(config.db.database);
    expect(customConfig.user).toBe(config.db.user);
  });

  describe('parseTrustProxy helper', () => {
    const parse = config.parseTrustProxy;

    it('parses empty, false, and zero values to Boolean false', () => {
      expect(parse(undefined)).toBe(false);
      expect(parse(null)).toBe(false);
      expect(parse('')).toBe(false);
      expect(parse(false)).toBe(false);
      expect(parse('false')).toBe(false);
      expect(parse('FALSE')).toBe(false);
      expect(parse('0')).toBe(false);
    });

    it('parses numeric hop counts to integers', () => {
      expect(parse('1')).toBe(1);
      expect(parse('2')).toBe(2);
      expect(parse(1)).toBe(1);
    });

    it('parses valid IP, subnet, and keyword specifiers', () => {
      expect(parse('loopback')).toBe('loopback');
      expect(parse('linklocal')).toBe('linklocal');
      expect(parse('uniquelocal')).toBe('uniquelocal');
      expect(parse('127.0.0.1, 10.0.0.0/8')).toBe('127.0.0.1, 10.0.0.0/8');
      expect(parse('::1, fe80::/10')).toBe('::1, fe80::/10');
    });

    it('allows boolean true in non-production environments', () => {
      expect(parse(true, 'development')).toBe(true);
      expect(parse('true', 'test')).toBe(true);
    });

    it('rejects unrestricted TRUST_PROXY=true in production', () => {
      expect(() => parse(true, 'production')).toThrow(
        /Unrestricted TRUST_PROXY=true is not permitted in production/i
      );
      expect(() => parse('true', 'production')).toThrow(
        /Unrestricted TRUST_PROXY=true is not permitted in production/i
      );
    });

    it('rejects invalid or unsafe proxy configuration strings', () => {
      expect(() => parse('invalid_proxy_setting')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse('10.0.0.1; rm -rf /')).toThrow(/Invalid TRUST_PROXY configuration/i);
    });
  });

  describe('parseTlsMinVersion helper', () => {
    const parse = config.parseTlsMinVersion;

    it('defaults to TLSv1.2 when undefined or empty', () => {
      expect(parse(undefined)).toBe('TLSv1.2');
      expect(parse('')).toBe('TLSv1.2');
    });

    it('accepts TLSv1.2 and TLSv1.3', () => {
      expect(parse('TLSv1.2')).toBe('TLSv1.2');
      expect(parse('TLSv1.3')).toBe('TLSv1.3');
    });

    it('rejects protocols weaker than TLS 1.2 per AC-SEBM-SR-001', () => {
      expect(() => parse('TLSv1.1')).toThrow(/AC-SEBM-SR-001/);
      expect(() => parse('TLSv1.0')).toThrow(/AC-SEBM-SR-001/);
      expect(() => parse('TLSv1')).toThrow(/AC-SEBM-SR-001/);
      expect(() => parse('SSLv3')).toThrow(/AC-SEBM-SR-001/);
    });
  });

  describe('validateTlsFiles helper', () => {
    it('throws when cert or key path is missing', () => {
      expect(() => validateTlsFiles('', '')).toThrow(/TLS_CERT_PATH and TLS_KEY_PATH are required/);
      expect(() => validateTlsFiles('/path/cert.pem', undefined)).toThrow(/TLS_CERT_PATH and TLS_KEY_PATH are required/);
    });

    it('throws when cert or key file does not exist', () => {
      expect(() =>
        validateTlsFiles('/non/existent/cert.pem', '/non/existent/key.pem')
      ).toThrow(/TLS_CERT_PATH file does not exist/);
    });
  });
});
