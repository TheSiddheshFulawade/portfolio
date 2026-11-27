/** One step of the headline: show phrase `index` from `at` ms after the cycle starts, until the next frame. */
export interface HeadlineFrame {
  index: number;
  at: number;
}

/** Time before the first phrase swaps in, and how long each phrase stays (REQ-HOME-101, REQ-MOT-101). */
const START_MS = 400;
const HOLD_MS = 850;

/**
 * The frames of the headline's last phrase: each phrase once, in order, ending on the last one, which is the
 * phrase in the prerendered HTML. Pure and short: with five phrases the cycle settles at 3,800 ms, inside the
 * 5 s limit (a 320 ms fade included). One phrase gives one frame; none gives none.
 */
export function headlineFrames(phraseCount: number): HeadlineFrame[] {
  if (phraseCount < 1) return [];
  if (phraseCount === 1) return [{ index: 0, at: 0 }];
  return Array.from({ length: phraseCount }, (_, index) => ({
    index,
    at: START_MS + index * HOLD_MS,
  }));
}
