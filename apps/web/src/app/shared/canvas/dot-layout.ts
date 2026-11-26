/** One dot, in canvas pixels. */
export interface Dot {
  x: number;
  y: number;
}

// Glyph grid: 9 columns by 13 rows of cells; a cell holds one dot.
const COLS = 9;
const ROWS = 13;
const GAP = 2;

/** "0": an elliptical ring about two cells thick. */
function zero(x: number, y: number): boolean {
  const v = ((x - 4) / 4.5) ** 2 + ((y - 6) / 6.5) ** 2;
  return v <= 1 && v >= 0.5;
}

/** "4": a stem on the right, a crossbar low down and a diagonal from the stem's top to the bar's left end. */
function four(x: number, y: number): boolean {
  const start = Math.round(6 * (1 - y / 8));
  const diagonal = y <= 8 && x >= start && x <= start + 1;
  return x === 6 || x === 7 || y === 8 || y === 9 || diagonal;
}

const GLYPHS: Record<string, (x: number, y: number) => boolean> = { '0': zero, '4': four };

// The invariant field (REQ-HOME-103) uses a finer grid: 29 columns by 41 rows of cells, so that "Σ=0" is made
// of about 1,500 dots. The grid, not the canvas, decides how many dots there are.
const FIELD_COLS = 29;
const FIELD_ROWS = 41;
const FIELD_GAP = 3;
const STROKE = 5;

/** "0" on the fine grid: an elliptical ring STROKE cells thick. */
function fineZero(x: number, y: number): boolean {
  const rx = FIELD_COLS / 2;
  const ry = FIELD_ROWS / 2;
  const v = ((x + 0.5 - rx) / rx) ** 2 + ((y + 0.5 - ry) / ry) ** 2;
  const inner = (1 - STROKE / rx) * (1 - STROKE / rx);
  return v <= 1 && v >= inner;
}

/** "Σ": a bar on top, a bar at the bottom and two strokes meeting in the middle. */
function sigma(x: number, y: number): boolean {
  if (y < STROKE || y >= FIELD_ROWS - STROKE) return true;
  const half = FIELD_ROWS / 2;
  const reach = (FIELD_COLS - STROKE) * 0.62;
  const centre = ((y < half ? y : FIELD_ROWS - 1 - y) / half) * reach;
  return x >= centre && x < centre + STROKE;
}

/** "=": two bars. */
function equals(x: number, y: number): boolean {
  const top = Math.round(FIELD_ROWS * 0.27);
  const bottom = Math.round(FIELD_ROWS * 0.73) - STROKE;
  return (
    x >= 2 &&
    x < FIELD_COLS - 2 &&
    ((y >= top && y < top + STROKE) || (y >= bottom && y < bottom + STROKE))
  );
}

const FIELD_GLYPHS: Record<string, (x: number, y: number) => boolean> = {
  '0': fineZero,
  Σ: sigma,
  '=': equals,
};

/**
 * Lays out text as a field of dots (the 404 page, REQ-UI-104). Pure: the same text and size always give the
 * same dots, in glyph order then row order. The text is centred, sized to fit the canvas, and scales with it.
 * Characters without a glyph are skipped; empty text or an empty canvas gives no dots.
 */
export function layoutDots(text: string, width: number, height: number): Dot[] {
  const chars = [...text].filter((c) => GLYPHS[c]);
  if (!chars.length || !(width > 0) || !(height > 0)) return [];

  const columns = chars.length * COLS + (chars.length - 1) * GAP;
  const cell = Math.min((width * 0.84) / columns, (height * 0.72) / ROWS);
  const left = (width - columns * cell) / 2;
  const top = (height - ROWS * cell) / 2;
  const dots: Dot[] = [];

  chars.forEach((c, i) => {
    const offset = i * (COLS + GAP);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (GLYPHS[c](x, y)) {
          dots.push({ x: left + (offset + x + 0.5) * cell, y: top + (y + 0.5) * cell });
        }
      }
    }
  });
  return dots;
}

/**
 * Lays out the invariant field's text on the fine grid. Same rules as `layoutDots`, plus: dots come in
 * x-then-y order, and the two dots of a transaction are vertical neighbours, so a run of dots in one column
 * gives pairs (2i, 2i+1) and an odd run drops its last dot. The dot count is even, and fixed by the grid:
 * it does not depend on the canvas size, so prerendered and live counters agree.
 */
export function layoutField(text: string, width: number, height: number): Dot[] {
  const chars = [...text].filter((c) => FIELD_GLYPHS[c]);
  if (!chars.length || !(width > 0) || !(height > 0)) return [];

  const columns = chars.length * FIELD_COLS + (chars.length - 1) * FIELD_GAP;
  const cell = Math.min((width * 0.9) / columns, (height * 0.86) / FIELD_ROWS);
  const left = (width - columns * cell) / 2;
  const top = (height - FIELD_ROWS * cell) / 2;
  const dots: Dot[] = [];

  chars.forEach((c, i) => {
    const offset = i * (FIELD_COLS + FIELD_GAP);
    for (let x = 0; x < FIELD_COLS; x++) {
      let run: number[] = [];
      const flush = () => {
        if (run.length % 2) run.pop();
        for (const y of run) {
          dots.push({ x: left + (offset + x + 0.5) * cell, y: top + (y + 0.5) * cell });
        }
        run = [];
      };
      for (let y = 0; y < FIELD_ROWS; y++) {
        if (FIELD_GLYPHS[c](x, y)) run.push(y);
        else flush();
      }
      flush();
    }
  });
  return dots;
}
