const config = require('../../src/config');

describe('parseSessionTimeoutSeconds', () => {
  const { parseSessionTimeoutSeconds } = config;

  test('defaults to 900 seconds when unset', () => {
    expect(parseSessionTimeoutSeconds(undefined)).toBe(900);
    expect(parseSessionTimeoutSeconds('')).toBe(900);
  });

  test('parses a positive integer string', () => {
    expect(parseSessionTimeoutSeconds('1800')).toBe(1800);
  });

  test.each(['0', '-5', '1.5', 'abc', '15m'])('rejects %s', (bad) => {
    expect(() => parseSessionTimeoutSeconds(bad)).toThrow(/Invalid SESSION_TIMEOUT_SECONDS/);
  });
});

test('config exposes a numeric sessionTimeoutSeconds', () => {
  expect(Number.isInteger(config.sessionTimeoutSeconds)).toBe(true);
  expect(config.sessionTimeoutSeconds).toBeGreaterThan(0);
});