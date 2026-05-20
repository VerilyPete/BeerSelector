import {
  shouldRunFocusCheck,
  shouldRunFocusRefresh,
  resetFocusRefreshThrottle,
} from '../focusRefreshThrottle';

const FIVE_MIN = 5 * 60 * 1000;

describe('shouldRunFocusCheck', () => {
  it('allows a run once the throttle window has fully elapsed', () => {
    expect(shouldRunFocusCheck(1_000, 1_000 + FIVE_MIN, FIVE_MIN)).toBe(true);
  });

  it('blocks a run that falls inside the throttle window', () => {
    expect(shouldRunFocusCheck(1_000, 1_000 + 60_000, FIVE_MIN)).toBe(false);
  });

  it('allows the first run when there is no prior timestamp', () => {
    expect(shouldRunFocusCheck(0, FIVE_MIN, FIVE_MIN)).toBe(true);
  });
});

describe('shouldRunFocusRefresh', () => {
  beforeEach(() => resetFocusRefreshThrottle());

  it('runs on the first focus then throttles rapid subsequent focuses', () => {
    const t0 = 1_000_000;
    expect(shouldRunFocusRefresh(t0)).toBe(true);
    expect(shouldRunFocusRefresh(t0 + 1_000)).toBe(false);
    expect(shouldRunFocusRefresh(t0 + 60_000)).toBe(false);
  });

  it('runs again once the throttle window elapses', () => {
    const t0 = 1_000_000;
    expect(shouldRunFocusRefresh(t0)).toBe(true);
    expect(shouldRunFocusRefresh(t0 + FIVE_MIN)).toBe(true);
  });

  it('can be reset (for test isolation)', () => {
    const t0 = 1_000_000;
    expect(shouldRunFocusRefresh(t0)).toBe(true);
    expect(shouldRunFocusRefresh(t0 + 1_000)).toBe(false);
    resetFocusRefreshThrottle();
    expect(shouldRunFocusRefresh(t0 + 1_000)).toBe(true);
  });
});
