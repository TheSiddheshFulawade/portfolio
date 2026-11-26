import { headlineFrames } from './headline-cycle';

// REQ-HOME-101, REQ-MOT-101: the last phrase of the headline may cycle once and must end on the
// prerendered phrase well inside 5 s. Assumed API: headlineFrames(phraseCount) => { index, at }[]
// (at in ms from the start of the cycle; each frame stays until the next one).
const TRANSITION_MS = 320;

describe('headlineFrames', () => {
  for (const count of [2, 3, 4, 5]) {
    describe(`with ${count} phrases`, () => {
      const frames = headlineFrames(count);

      it('REQ-HOME-101 starts at the first phrase and shows each phrase once, in order', () => {
        expect(frames.map((f) => f.index)).toEqual(Array.from({ length: count }, (_, i) => i));
        expect(frames[0].at).toBeGreaterThanOrEqual(0);
      });

      it('REQ-HOME-101 REQ-MOT-101 ends on the last phrase and settles in under 5,000 ms', () => {
        const last = frames[frames.length - 1];

        expect(last.index).toBe(count - 1);
        expect(last.at + TRANSITION_MS).toBeLessThan(5_000);
      });

      it('REQ-HOME-101 times increase, and each phrase stays at least as long as the transition', () => {
        for (let i = 1; i < frames.length; i++) {
          expect(frames[i].at - frames[i - 1].at).toBeGreaterThanOrEqual(TRANSITION_MS);
        }
      });

      it('REQ-ACC-003 is pure: the same count gives the same frames', () => {
        expect(headlineFrames(count)).toEqual(frames);
      });
    });
  }

  it('REQ-HOME-101 one phrase gives a single frame on that phrase', () => {
    const frames = headlineFrames(1);

    expect(frames).toHaveLength(1);
    expect(frames[0].index).toBe(0);
    expect(frames[0].at + TRANSITION_MS).toBeLessThan(5_000);
  });

  it('REQ-HOME-101 no phrases gives no frames', () => {
    expect(headlineFrames(0)).toEqual([]);
  });
});
