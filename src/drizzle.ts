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
    const isCoinBand = r >= COIN_ROW_TOP && r <= COIN_ROW_BOT

    let row = ''
    let curX = 0

    for (let c = 0; c < COLS; c++) {
      const cellEndX = (c + 1) * CELL_W
      const inCoinExclude =
        isCoinBand && c >= COIN_COL_LEFT && c <= COIN_COL_RIGHT
      const density = inCoinExclude
        ? 0
        : isCoinBand
          ? throughDensity
          : r < COIN_ROW_TOP
            ? aboveDensity
            : belowDensity

      if (density > 0 && rng() < density) {
        const glyph = palette[Math.floor(rng() * palette.length)]
        row += glyph
        curX += getTextWidth(glyph)
      }

      while (curX + SPACE_W <= cellEndX) {
        row += ' '
        curX += SPACE_W
      }
    }

    lines.push(row.replace(/\s+$/, ''))
  }

  return lines.join('\n')
}
