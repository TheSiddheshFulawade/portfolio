import { homeContent } from './home-content';

// Finance R5-F1: counter labels are content (content/site.yaml, built into homeContent), exact wording.
describe('invariant field counter labels (REQ-HOME-103)', () => {
  it('REQ-HOME-103 counter labels use the audited wording', () => {
    expect(homeContent.field.counters).toMatchObject({
      committed: 'Committed entries',
      reachable: 'Reachable entries',
      unreachable: 'Unreachable entries',
      recovering: 'Entries awaiting replay',
      duplicates: 'Duplicate transactions not applied',
    });
  });
});
