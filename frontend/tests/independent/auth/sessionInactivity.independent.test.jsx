/**
 * Independent verification - S2-02 Session timeout, client side (SEBM-SR-004)
 * AC-SEBM-SR-004: session expires and requires re-authentication after the configured timeout.
 * SR-004 text: log out after a configurable period of INACTIVITY.
 * Written by the tester (Dev A) from the SRS; the owner's test only covers the "no activity at all" case.
 * jsdom + fake timers: this exercises the real AuthProvider, not a real browser.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../../src/auth/AuthContext';

const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const tokenExpiringIn = (ms) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ userId: 'u1', role: 'user', tokenType: 'access', exp: Math.floor((Date.now() + ms) / 1000) })}.sig`;

function Harness({ tokenLifetimeMs }) {
  const { isAuthenticated, setAccessToken, setUser } = useAuth();
  return (
    <>
      <button onClick={() => { setUser({ userId: 'u1' }); setAccessToken(tokenExpiringIn(tokenLifetimeMs)); }}>sign-in</button>
      <span data-testid="state">{isAuthenticated ? 'in' : 'out'}</span>
    </>
  );
}

const signIn = async (tokenLifetimeMs = 2 * 60 * 60 * 1000) => {
  render(<AuthProvider><Harness tokenLifetimeMs={tokenLifetimeMs} /></AuthProvider>);
  await act(async () => { screen.getByText('sign-in').click(); });
};
const advance = (ms) => act(async () => { vi.advanceTimersByTime(ms); });
const state = () => screen.getByTestId('state').textContent;

describe('S2-02 client inactivity timeout (SEBM-SR-004)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubEnv('VITE_SESSION_TIMEOUT_SECONDS', '60'); });
  afterEach(() => { cleanup(); vi.runOnlyPendingTimers(); vi.unstubAllEnvs(); vi.useRealTimers(); });

  it('IND-UI-01 stays signed in just before the configured timeout and is signed out just after it', async () => {
    await signIn();
    await advance(59 * 1000);
    expect(state()).toBe('in');
    await advance(2 * 1000);
    expect(state()).toBe('out');
  });

  it.each(['click', 'keydown', 'mousemove', 'touchstart', 'scroll', 'pointerdown'])(
    'IND-UI-02 a %s event counts as activity and restarts the inactivity period', async (eventName) => {
      await signIn();
      await advance(50 * 1000);
      await act(async () => { window.dispatchEvent(new Event(eventName)); });
      await advance(50 * 1000); // 100s since sign-in, 50s since activity
      expect(state()).toBe('in');
      await advance(11 * 1000); // 61s since activity
      expect(state()).toBe('out');
    });

  it('IND-UI-03 after being signed out, later activity does not sign the user back in', async () => {
    await signIn();
    await advance(61 * 1000);
    expect(state()).toBe('out');
    await act(async () => { window.dispatchEvent(new Event('click')); });
    expect(state()).toBe('out');
  });

  it('IND-UI-04 an access token that expires before the inactivity period ends still signs the user out', async () => {
    await signIn(20 * 1000);
    await act(async () => { window.dispatchEvent(new Event('click')); });
    await advance(25 * 1000);
    expect(state()).toBe('out');
  });
});
