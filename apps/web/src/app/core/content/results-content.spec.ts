import { resultFor } from './results-content';

describe('results content', () => {
  it('REQ-ACC-004 a measured result carries machine, runs, workload and the source commit', () => {
    const result = resultFor('settlement-lab');

    expect(result).toBeDefined();
    expect(result?.machine.length).toBeGreaterThan(0);
    expect(result?.cores).toBeGreaterThan(0);
    expect(result?.runs).toBeGreaterThan(0);
    expect(result?.workload.length).toBeGreaterThan(0);
    expect(result?.source.commit).toMatch(/^[0-9a-f]{7,40}$/);
    expect(result?.rows.length).toBeGreaterThan(0);
  });

  it('REQ-PROJ-104 an unknown project has no result', () => {
    expect(resultFor('does-not-exist')).toBeUndefined();
  });
});
