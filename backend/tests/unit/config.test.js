const config = require('../../src/config');
const { getPoolConfig } = require('../../src/db');
const { validateTlsFiles, createServer } = require('../../src/server');

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

    expect(config.db.database).toBe(
      process.env.DB_NAME ||
      process.env.POSTGRES_DB ||
      process.env.PGDATABASE ||
      (config.nodeEnv === 'test' ? 'sebm_test' : 'sebm')
    );

    expect(config.db.user).toBe('sebm');

    expect(config.db.password).toBe(
      process.env.DB_PASSWORD ||
      process.env.POSTGRES_PASSWORD ||
      process.env.PGPASSWORD ||
      'sebm_dev_password'
    );

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
      expect(parse(0)).toBe(false);
    });

    it('parses numeric hop counts to integers', () => {
      expect(parse('1')).toBe(1);
      expect(parse('2')).toBe(2);
      expect(parse(1)).toBe(1);
    });

    it('normalizes recognized proxy keywords to lowercase while preserving valid IP/CIDR entries', () => {
      expect(parse('LOOPBACK')).toBe('loopback');
      expect(parse('Loopback')).toBe('loopback');
      expect(parse('LinkLocal')).toBe('linklocal');
      expect(parse('LINKLOCAL')).toBe('linklocal');
      expect(parse('UniqueLocal')).toBe('uniquelocal');
      expect(parse('UNIQUELOCAL')).toBe('uniquelocal');
      expect(parse('Loopback, 10.0.0.0/8')).toBe('loopback, 10.0.0.0/8');
      expect(parse('127.0.0.1, LinkLocal, ::1')).toBe('127.0.0.1, linklocal, ::1');
      expect(parse('UNIQUELOCAL, fe80::/10')).toBe('uniquelocal, fe80::/10');
    });

    it('rejects unsafe or excessively large numeric hop counts', () => {
      expect(() => parse(Number.MAX_SAFE_INTEGER + 10)).toThrow(/Invalid TRUST_PROXY hop count/i);
      expect(() => parse(1e25)).toThrow(/Invalid TRUST_PROXY hop count/i);
      expect(() => parse('9007199254740992')).toThrow(/Invalid TRUST_PROXY hop count/i);
      expect(() => parse('999999999999999999999999999999999999')).toThrow(/Invalid TRUST_PROXY hop count/i);
      expect(() => parse(Infinity)).toThrow(/Invalid TRUST_PROXY hop count/i);
      expect(() => parse(NaN)).toThrow(/Invalid TRUST_PROXY hop count/i);
    });

    it('parses valid IP, subnet, and keyword specifiers', () => {
      expect(parse('loopback')).toBe('loopback');
      expect(parse('linklocal')).toBe('linklocal');
      expect(parse('uniquelocal')).toBe('uniquelocal');
      expect(parse('127.0.0.1, 10.0.0.0/8')).toBe('127.0.0.1, 10.0.0.0/8');
      expect(parse('::1, fe80::/10')).toBe('::1, fe80::/10');
      expect(parse('192.168.1.1/32')).toBe('192.168.1.1/32');
      expect(parse('10.0.0.0/0')).toBe('10.0.0.0/0');
      expect(parse('::/0')).toBe('::/0');
      expect(parse('::1/128')).toBe('::1/128');
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

    it('rejects malformed IP addresses without valid syntax', () => {
      expect(() => parse('999.999.999.999')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse('256.0.0.1')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse('1.2.3.4.5')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse('127.0.0')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse('::gggg')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse(':::')).toThrow(/Invalid TRUST_PROXY configuration/i);
    });

    it('rejects out-of-range or malformed CIDR prefixes', () => {
      // IPv4 prefix must be 0-32
      expect(() => parse('10.0.0.0/33')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse('10.0.0.0/-1')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse('10.0.0.0/abc')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse('10.0.0.0/')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse('10.0.0.0//8')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse('10.0.0.0/8/8')).toThrow(/Invalid TRUST_PROXY configuration/i);

      // IPv6 prefix must be 0-128
      expect(() => parse('::1/129')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse('fe80::/200')).toThrow(/Invalid TRUST_PROXY configuration/i);
    });

    it('rejects invalid or unsafe proxy configuration strings and malformed lists', () => {
      expect(() => parse('invalid_proxy_setting')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse('10.0.0.1; rm -rf /')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse('127.0.0.1, 999.999.999.999')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse('127.0.0.1, ')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse(',')).toThrow(/Invalid TRUST_PROXY configuration/i);
      expect(() => parse(-1)).toThrow(/Invalid TRUST_PROXY hop count/i);
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
    it('throws when cert or key path is missing or non-string', () => {
      expect(() => validateTlsFiles('', '')).toThrow(/TLS_CERT_PATH and TLS_KEY_PATH are required/);
      expect(() => validateTlsFiles('/path/cert.pem', undefined)).toThrow(/TLS_CERT_PATH and TLS_KEY_PATH are required/);
      expect(() => validateTlsFiles('   ', '/path/key.pem')).toThrow(/TLS_CERT_PATH and TLS_KEY_PATH are required/);
    });

    it('throws when cert or key file does not exist', () => {
      expect(() =>
        validateTlsFiles('/non/existent/cert.pem', '/non/existent/key.pem')
      ).toThrow(/TLS_CERT_PATH file does not exist/);
    });

    it('throws when cert or key path points to a directory instead of a file', () => {
      expect(() => validateTlsFiles(__dirname, __dirname)).toThrow(/is not a file/);
    });
  });

  describe('createServer TLS version guard', () => {
    it('rejects server creation when minVersion is weaker than TLSv1.2', () => {
      expect(() => {
        createServer(null, {
          tls: {
            enabled: true,
            minVersion: 'TLSv1.1',
            certPath: __filename,
            keyPath: __filename,
          },
        });
      }).toThrow(/AC-SEBM-SR-001/);
    });
  });
});
