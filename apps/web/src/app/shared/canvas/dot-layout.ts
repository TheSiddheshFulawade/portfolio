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
