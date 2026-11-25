import { decisions } from './home-content';

describe('home content', () => {
  it('REQ-HOME-105 every decision states choice, rejected option, reason, cost and evidence', () => {
    expect(decisions.length).toBeGreaterThanOrEqual(3);
    for (const decision of decisions) {
      for (const field of ['title', 'choice', 'rejected', 'reason', 'cost'] as const)
        expect(decision[field].length, `${decision.id}.${field}`).toBeGreaterThan(0);
      expect(decision.evidence.length, `${decision.id} evidence`).toBeGreaterThan(0);
    }
  });

  it('REQ-HOME-105 decisions come sorted by order', () => {
    const orders = decisions.map((d) => d.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});
