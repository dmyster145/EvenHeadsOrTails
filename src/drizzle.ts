import { getTextWidth } from '@evenrealities/pretext'

export type DrizzlePhase = 'idle' | 'up' | 'down' | 'landed'

const IDLE_PALETTE = ['·', '·', '·', '°']

const PALETTES: Record<DrizzlePhase, string[]> = {
  idle: IDLE_PALETTE,
  up: ['↑', '▲', '△', '·'],
  down: ['↓', '▼', '▽', '·'],
  landed: IDLE_PALETTE,
}

const CELL_W = 16
const COLS = 35
const ROWS = 9

const COIN_ROW_TOP = 2
const COIN_ROW_BOT = 7
const COIN_COL_LEFT = 13
const COIN_COL_RIGHT = 22

const SPACE_W = getTextWidth(' ') || 4

function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeInitialDrizzleFrame(): string {
  return '\n'.repeat(ROWS - 1)
}

export function makeDrizzleFrame(phase: DrizzlePhase, seed: number): string {
  const rng = mulberry32(seed)
  const palette = PALETTES[phase]

  const aboveDensity = phase === 'idle' ? 0.10 : 0.15
  const belowDensity = phase === 'idle' ? 0.08 : 0.12
  const throughDensity = phase === 'landed' ? 0.05 : 0.02

  const lines: string[] = []
  for (let r = 0; r < ROWS; r++) {
    // Only the top row is reserved (tally bar). The bottom row rains too — the
    // status is a single stationary line pinned below the drizzle's last line,
    // so the rain reaches the top of the status bar without overlapping it.
    if (r === 0) {
      lines.push('')
      continue
    }

    const isCoinBand = r >= COIN_ROW_TOP && r <= COIN_ROW_BOT
    const density = isCoinBand
      ? throughDensity
      : r < COIN_ROW_TOP
        ? aboveDensity
        : belowDensity

    // Columns available for rain (skip the coin's footprint on coin-band rows).
    const allowed: number[] = []
    for (let c = 0; c < COLS; c++) {
      if (isCoinBand && c >= COIN_COL_LEFT && c <= COIN_COL_RIGHT) continue
      allowed.push(c)
    }

    // Stratified placement: split the available columns into N even segments and
    // drop one glyph at a random spot in each. Even spread, still random — avoids
    // the clustering of independent per-cell rolls.
    const count = Math.round(allowed.length * density)
    const glyphCols = new Set<number>()
    for (let i = 0; i < count; i++) {
      const lo = Math.floor((i * allowed.length) / count)
      const hi = Math.floor(((i + 1) * allowed.length) / count)
      const idx = lo + Math.floor(rng() * Math.max(1, hi - lo))
      glyphCols.add(allowed[Math.min(idx, allowed.length - 1)])
    }

    let row = ''
    let curX = 0
    for (let c = 0; c < COLS; c++) {
      if (glyphCols.has(c)) {
        const glyph = palette[Math.floor(rng() * palette.length)]
        row += glyph
        curX += getTextWidth(glyph)
      }
      const cellEndX = (c + 1) * CELL_W
      while (curX + SPACE_W <= cellEndX) {
        row += ' '
        curX += SPACE_W
      }
    }

    lines.push(row.replace(/\s+$/, ''))
  }

  return lines.join('\n')
}
