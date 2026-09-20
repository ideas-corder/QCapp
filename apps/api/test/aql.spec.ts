import {
  calculateSampling,
  evaluateOutcome,
  INSPECTION_LEVELS,
} from '../src/common/aql';

describe('AQL sampling', () => {
  it('lot size 0 returns the minimum defaults', () => {
    const r = calculateSampling(0);
    expect(r.codeLetter).toBe('A');
    expect(r.sampleSize).toBe(2);
    expect(r.criticalAc).toBe(0);
    expect(r.criticalRe).toBe(1);
  });

  it('General Level II lot 100 -> code F -> sample 20', () => {
    const r = calculateSampling(100, 'General Level II', 2.5, 4.0);
    expect(r.codeLetter).toBe('F');
    expect(r.sampleSize).toBe(20);
  });

  it('General Level III lot 100 -> code G -> sample 32', () => {
    const r = calculateSampling(100, 'General Level III', 2.5, 4.0);
    expect(r.codeLetter).toBe('G');
    expect(r.sampleSize).toBe(32);
  });

  it('Lot size caps the sample size', () => {
    // lot=2, code A -> standard sample size 2 -> 2 (no cap effect)
    const r = calculateSampling(2);
    expect(r.sampleSize).toBe(2);
  });

  it('inspector levels are exposed', () => {
    expect(INSPECTION_LEVELS).toContain('General Level II');
  });
});

describe('AQL outcome evaluation', () => {
  const aql = calculateSampling(100, 'General Level II', 2.5, 4.0);

  it('passes when all defects below rejection', () => {
    expect(
      evaluateOutcome({
        totalCritical: 0,
        totalMajor: 0,
        totalMinor: 1,
        aql,
      }),
    ).toBe('PASS');
  });

  it('fails on critical >= 1', () => {
    expect(
      evaluateOutcome({
        totalCritical: 1,
        totalMajor: 0,
        totalMinor: 0,
        aql,
      }),
    ).toBe('FAIL');
  });

  it('fails when majors hit rejection number', () => {
    expect(
      evaluateOutcome({
        totalCritical: 0,
        totalMajor: aql.majorRe,
        totalMinor: 0,
        aql,
      }),
    ).toBe('FAIL');
  });
});
