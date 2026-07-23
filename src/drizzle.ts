// Ambient rain: seeded stippling that falls around the coin/die art during
// idle, flip, and landing phases. The dice roll's debris field is the separate
// rollField.ts; both render on the shared charGrid.

import {
  COLS,
  ROWS,
  COIN_ROW_TOP,
  COIN_ROW_BOT,
  COIN_COL_LEFT,
  COIN_COL_RIGHT,
  layoutRow,
  mulberry32,
} from './charGrid'

export type DrizzlePhase =
  | 'idle'
  | 'up'
  | 'down'
  | 'landed'
  // Dice roll: a persistent debris field streaming downward past the die
  // (rendered by rollField.ts's makeRollFieldFrame, not makeDrizzleFrame).
  | 'motion'

const IDLE_PALETTE = ['·', '·', '·', '°']

interface PhaseStyle {
  palette: string[]
  /** Densities per row band: above the die, through its band, below it. */
  above: number
  through: number
  below: number
}

type PaletteDrizzlePhase = Exclude<DrizzlePhase, 'motion'>

const PHASE_STYLES: Record<PaletteDrizzlePhase, PhaseStyle> = {
  idle: { palette: IDLE_PALETTE, above: 0.1, through: 0.02, below: 0.08 },
  up: { palette: ['↑', '▲', '△', '·'], above: 0.15, through: 0.02, below: 0.12 },
  down: { palette: ['↓', '▼', '▽', '·'], above: 0.15, through: 0.02, below: 0.12 },
  landed: { palette: IDLE_PALETTE, above: 0.15, through: 0.05, below: 0.12 },
}

// Rain columns per row category, precomputed once: the geometry is fixed and
// makeDrizzleFrame runs on every ambient tick. OPEN_COLS skips the coin's
// footprint for coin-band rows; readers never mutate these.
const ALL_COLS: number[] = []
const OPEN_COLS: number[] = []
for (let c = 0; c < COLS; c++) {
  ALL_COLS.push(c)
  if (c < COIN_COL_LEFT || c > COIN_COL_RIGHT) OPEN_COLS.push(c)
}

export function makeInitialDrizzleFrame(): string {
  return '\n'.repeat(ROWS - 1)
}

// Stratified placement: split the available columns into N even segments and
// drop one glyph at a random spot in each. Even spread, still random — avoids
// the clustering of independent per-cell rolls.
function placeGlyphs(
  allowed: number[],
  density: number,
  rng: () => number,
  into: Set<number>,
): void {
  const count = Math.round(allowed.length * density)
  for (let i = 0; i < count; i++) {
    const lo = Math.floor((i * allowed.length) / count)
    const hi = Math.floor(((i + 1) * allowed.length) / count)
    const idx = lo + Math.floor(rng() * Math.max(1, hi - lo))
    into.add(allowed[Math.min(idx, allowed.length - 1)])
  }
}

export function makeDrizzleFrame(
  phase: PaletteDrizzlePhase,
  seed: number,
): string {
  const rng = mulberry32(seed)
  const style = PHASE_STYLES[phase]
  const palette = style.palette

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
      ? style.through
      : r < COIN_ROW_TOP
        ? style.above
        : style.below

    const allowed = isCoinBand ? OPEN_COLS : ALL_COLS

    const glyphCols = new Set<number>()
    placeGlyphs(allowed, density, rng, glyphCols)

    lines.push(
      layoutRow(c =>
        glyphCols.has(c) ? palette[Math.floor(rng() * palette.length)] : null,
      ),
    )
  }

  return lines.join('\n')
}
