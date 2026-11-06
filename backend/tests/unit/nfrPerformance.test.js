const { percentile, summarizeSamples } = require('../../scripts/nfr/performance-smoke');

describe('TC-Perf-01 performance summary', () => {
  it('uses nearest-rank p90 and passes when at least 90% of requests meet the target', () => {
    const samples = Array.from({ length: 10 }, (_, index) => ({
      ok: true,
      durationMs: index + 1,
    }));

    expect(percentile(samples.map((sample) => sample.durationMs), 90)).toBe(9);
    const summary = summarizeSamples(samples, 9, 90);

    expect(summary.p90Ms).toBe(9);
    expect(summary.passingPercent).toBe(90);
    expect(summary.passed).toBe(true);
  });

  it('fails when fewer than 90% of requests are successful and within budget', () => {
    const samples = [
      ...Array.from({ length: 8 }, () => ({ ok: true, durationMs: 400 })),
      { ok: false, durationMs: 500 },
      { ok: false, durationMs: 600 },
    ];

    const summary = summarizeSamples(samples, 2000, 90);

    expect(summary.successPercent).toBe(80);
    expect(summary.passingPercent).toBe(80);
    expect(summary.passed).toBe(false);
  });

  it('fails when p90 exceeds the configured response-time limit', () => {
    const samples = [
      ...Array.from({ length: 8 }, () => ({ ok: true, durationMs: 800 })),
      ...Array.from({ length: 2 }, () => ({ ok: true, durationMs: 2500 })),
    ];

    const summary = summarizeSamples(samples, 2000, 90);

    expect(summary.passingPercent).toBe(80);
    expect(summary.p90Ms).toBe(2500);
    expect(summary.passed).toBe(false);
  });

  it('rejects empty or invalid sample sets', () => {
    expect(() => summarizeSamples([])).toThrow(/At least one/);
    expect(() => summarizeSamples([{ ok: true, durationMs: -1 }])).toThrow(/finite, non-negative/);
  });
});
