const path = require('path');
const net = require('net');
const dotenv = require('dotenv');

// Load .env from current working directory
dotenv.config();

// Also attempt loading .env from backend directory if run from repository root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Also attempt loading .env from root directory if run from backend/
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Validates whether a single part is a recognized keyword, a valid IPv4/IPv6 address,
 * or a valid CIDR range with an in-bounds prefix (0-32 for IPv4, 0-128 for IPv6).
 * Uses Node.js built-in net.isIP to ensure genuine IP syntax.
 */
const isValidProxyAddressOrRange = (part) => {
  if (!part || typeof part !== 'string') return false;
  const trimmed = part.trim();
  if (!trimmed) return false;

  const allowedKeywords = ['loopback', 'linklocal', 'uniquelocal'];
  if (allowedKeywords.includes(trimmed.toLowerCase())) {
    return true;
  }

  const slashIndex = trimmed.indexOf('/');
  if (slashIndex === -1) {
    // Single IP address (IPv4 or IPv6)
    return net.isIP(trimmed) !== 0;
  }

  // Exactly one slash allowed for CIDR notation
  if (trimmed.indexOf('/', slashIndex + 1) !== -1) {
    return false;
  }

  const ip = trimmed.slice(0, slashIndex);
  const prefixStr = trimmed.slice(slashIndex + 1);

  // Prefix must be digits only without leading signs, decimals, or spaces
  if (!/^\d+$/.test(prefixStr)) {
    return false;
  }

  const ipVersion = net.isIP(ip);
  if (ipVersion === 0) {
    return false;
  }

  const prefix = parseInt(prefixStr, 10);
  if (ipVersion === 4) {
    // IPv4 CIDR prefix range: 0 to 32
    return prefix >= 0 && prefix <= 32;
  }
  if (ipVersion === 6) {
    // IPv6 CIDR prefix range: 0 to 128
    return prefix >= 0 && prefix <= 128;
  }

  return false;
};

/**
 * Parse and validate TRUST_PROXY configuration.
 * Disallows unrestricted TRUST_PROXY=true in production.
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
    if (val === 0) {
      return false;
    }
    if (Number.isSafeInteger(val) && val > 0) {
      return val;
    }
    throw new Error(`Invalid TRUST_PROXY hop count: ${val}`);
  }

  if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
    const trimmedVal = val.trim();
    const num = Number(trimmedVal);
    if (num === 0) {
      return false;
    }
    if (Number.isSafeInteger(num) && num > 0) {
      return num;
    }
    throw new Error(`Invalid TRUST_PROXY hop count: ${trimmedVal}`);
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.length > 0) {
      const parts = trimmed.split(',').map((p) => p.trim());
      const isValid = parts.length > 0 && parts.every((part) => isValidProxyAddressOrRange(part));
      if (isValid) {
        const allowedKeywords = ['loopback', 'linklocal', 'uniquelocal'];
        const normalizedParts = parts.map((part) => {
          if (allowedKeywords.includes(part.toLowerCase())) {
            return part.toLowerCase();
          }
          return part;
        });
        return normalizedParts.join(', ');
      }
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

const parsePositiveInteger = (value, defaultValue, label) => {
  const normalizedValue = value === undefined || value === null || value === '' ? String(defaultValue) : String(value);
  const parsedValue = Number.parseInt(normalizedValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error(`Invalid ${label}: ${value}. Expected a positive integer.`);
  }
  return parsedValue;
};

const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  get nodeEnv() {
    return process.env.NODE_ENV || 'development';
  },
  jwtSecret: process.env.JWT_SECRET || undefined,
  sessionTimeoutSeconds: parsePositiveInteger(
    process.env.SESSION_TIMEOUT_SECONDS ?? process.env.AUTH_TOKEN_LIFETIME_SECONDS ?? process.env.TOKEN_LIFETIME_SECONDS,
    15 * 60,
    'SESSION_TIMEOUT_SECONDS'
  ),
  passwordResetTokenLifetimeSeconds: parsePositiveInteger(
    process.env.PASSWORD_RESET_TOKEN_LIFETIME_SECONDS ?? process.env.RESET_TOKEN_LIFETIME_SECONDS,
    30 * 60,
    'PASSWORD_RESET_TOKEN_LIFETIME_SECONDS'
  ),
  tls: {
    enabled: process.env.TLS_ENABLED === 'true',
    certPath: process.env.TLS_CERT_PATH || undefined,
    keyPath: process.env.TLS_KEY_PATH || undefined,
    minVersion: parseTlsMinVersion(process.env.TLS_MIN_VERSION),
  },
  get trustProxy() {
    return parseTrustProxy(process.env.TRUST_PROXY, this.nodeEnv);
  },
  enforceHttps: process.env.ENFORCE_HTTPS === 'true',
  hstsIncludeSubdomains: process.env.HSTS_INCLUDE_SUBDOMAINS === 'true',
  db: {
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
    port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432', 10),
    get database() {
      const activeEnv = process.env.NODE_ENV || 'development';
      return activeEnv === 'test'
        ? 'sebm_test'
        : (
            process.env.DB_NAME
            || process.env.POSTGRES_DB
            || process.env.PGDATABASE
            || 'sebm'
          );
    },
    user: process.env.DB_USER || process.env.POSTGRES_USER || process.env.PGUSER || 'sebm',
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || 'sebm_dev_password',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT || '2000', 10),
  },
  parseTrustProxy,
  parseTlsMinVersion,
  isValidProxyAddressOrRange,
  parsePositiveInteger,
};

module.exports = config;