// The character-cell grid both background animations (the ambient drizzle and
// the dice-roll debris field) render on, plus the proportional-font row layout
// they share.

import { getTextWidth } from '@evenrealities/pretext'

// 16px cells across the 576px canvas, 9 text rows at the container's 27px
// line height.
export const CELL_W = 16
export const COLS = 35
export const ROWS = 9

// The coin/die footprint in grid cells. layout.ts centers the 144x144 image at
// x 216-360, y 72-216; rows 2-7 (~58-220px) and columns 13-22 (208-368px)
// cover that with under one cell of margin. Update alongside COIN_X/Y/W/H.
export const COIN_ROW_TOP = 2
export const COIN_ROW_BOT = 7
export const COIN_COL_LEFT = 13
export const COIN_COL_RIGHT = 22

// The G2 font's space advances 5px (see the mirror-font notes in index.html);
// the fallback only matters if the width table has no entry for ' '.
const SPACE_W = getTextWidth(' ') || 5

// Deterministic PRNG so a frame's glyph placement is reproducible from its
// seed alone.
export function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Lay out one text row on the proportional-font cell grid. glyphAt returns
// the glyph for a column or null for empty; spaces pad each cell to width.
export function layoutRow(glyphAt: (col: number) => string | null): string {
  let row = ''
  let curX = 0
  for (let c = 0; c < COLS; c++) {
    const glyph = glyphAt(c)
    if (glyph) {
      row += glyph
      curX += getTextWidth(glyph)
    }
    const cellEndX = (c + 1) * CELL_W
    while (curX + SPACE_W <= cellEndX) {
      row += ' '
      curX += SPACE_W
    }
  }
  return row.replace(/\s+$/, '')
}
