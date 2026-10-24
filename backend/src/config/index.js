const path = require('path');
const dotenv = require('dotenv');

// Load .env from current working directory
dotenv.config();

// Also attempt loading .env from backend directory if run from repository root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Also attempt loading .env from root directory if run from backend/
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Parse and validate TRUST_PROXY configuration.
 * Disallows unrestricted TRUST_PROXY=true in production.
 * Accepts:
 * - false, undefined, "", "false", "0" -> false
 * - "true" -> true (only allowed in non-production environments)
 * - integer or numeric string (e.g. "1") -> integer hop count
 * - keywords: "loopback", "linklocal", "uniquelocal"
 * - comma-separated list of valid IPs / CIDRs
 */
const parseTrustProxy = (val, nodeEnv = process.env.NODE_ENV || 'development') => {
  if (val === undefined || val === null || val === '' || val === false) {
    return false;
  }

  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    if (lower === 'false' || lower === '0') {
      return false;
    }
    if (lower === 'true') {
      if (nodeEnv === 'production') {
        throw new Error(
          'Unrestricted TRUST_PROXY=true is not permitted in production. Configure explicit trusted proxy IP/CIDRs (e.g. "loopback", "10.0.0.0/8") or hop count.'
        );
      }
      return true;
    }
  }

  if (val === true) {
    if (nodeEnv === 'production') {
      throw new Error(
        'Unrestricted TRUST_PROXY=true is not permitted in production. Configure explicit trusted proxy IP/CIDRs (e.g. "loopback", "10.0.0.0/8") or hop count.'
      );
    }
    return true;
  }

  // Integer hop count
  if (typeof val === 'number') {
    if (Number.isInteger(val) && val > 0) return val;
    throw new Error(`Invalid TRUST_PROXY hop count: ${val}`);
  }

  if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
    const hopCount = parseInt(val.trim(), 10);
    if (hopCount > 0) return hopCount;
    return false;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    const allowedKeywords = ['loopback', 'linklocal', 'uniquelocal'];
    const parts = trimmed.split(',').map((p) => p.trim());
    const isValid = parts.every((part) => {
      if (allowedKeywords.includes(part.toLowerCase())) return true;
      // IPv4, IPv6, or CIDR (e.g., 127.0.0.1, 10.0.0.0/8, ::1, fe80::/10)
      return /^([0-9a-fA-F:.]+(\/\d+)?)$/.test(part);
    });

    if (isValid && parts.length > 0) {
      return trimmed;
    }
  }

  throw new Error(
    `Invalid TRUST_PROXY configuration: "${val}". Specify boolean false, hop count integer, or valid IP/CIDR/keyword.`
  );
};

/**
 * Parse and validate TLS_MIN_VERSION.
 * TLS 1.2 is the mandatory minimum protocol version per AC-SEBM-SR-001.
 */
const parseTlsMinVersion = (val) => {
  if (!val) {
    return 'TLSv1.2';
  }
  const normalized = val.trim();
  const allowed = ['TLSv1.2', 'TLSv1.3'];
  if (!allowed.includes(normalized)) {
    throw new Error(
      `Invalid TLS_MIN_VERSION: "${val}". Protocol versions weaker than TLSv1.2 are rejected per AC-SEBM-SR-001.`
    );
  }
  return normalized;
};

const nodeEnv = process.env.NODE_ENV || 'development';

const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv,
  jwtSecret: process.env.JWT_SECRET || undefined,
  tls: {
    enabled: process.env.TLS_ENABLED === 'true',
    certPath: process.env.TLS_CERT_PATH || undefined,
    keyPath: process.env.TLS_KEY_PATH || undefined,
    minVersion: parseTlsMinVersion(process.env.TLS_MIN_VERSION),
  },
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY, nodeEnv),
  enforceHttps: process.env.ENFORCE_HTTPS === 'true',
  hstsIncludeSubdomains: process.env.HSTS_INCLUDE_SUBDOMAINS === 'true',
  db: {
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
    port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432', 10),
    database: process.env.DB_NAME || process.env.POSTGRES_DB || process.env.PGDATABASE || 'sebm',
    user: process.env.DB_USER || process.env.POSTGRES_USER || process.env.PGUSER || 'sebm',
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || 'sebm_dev_password',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT || '2000', 10),
  },
  parseTrustProxy,
  parseTlsMinVersion,
};

module.exports = config;
