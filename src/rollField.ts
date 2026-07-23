// Dice-roll motion field: a persistent set of debris particles that stream
// DOWNWARD past the die — the die reads as traveling forward — then slow with
// it and freeze when it stops. Corner glyphs step through their orientations
// clockwise on every moving update so each one appears to spin as it falls;
// at speed, non-corner debris blurs into ▕ streaks and resolves back into
// shapes as the field slows. The ambient rain lives in drizzle.ts; both render
// on the shared charGrid.

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

// Clockwise spin: filled corner sweeps upper-left → upper-right → lower-right
// → lower-left.
const SPIN_CW = ['◤', '◥', '◢', '◣']
const GEMS = ['◆', '◇', '■', '□', '▣']
const STREAK = '▕'

// Fraction of a moving update's velocity at which debris blurs into streaks.
const BLUR_VELOCITY = 2

// The particle world wraps vertically: twice the visible rows, so a steady
// stream enters from the top edge instead of visibly teleporting.
const FIELD_PERIOD = (ROWS - 1) * 2
const FIELD_DENSITY = 0.07

interface RollParticle {
  col: number
  row: number
  kind: 'corner' | 'gem'
  glyph: string
  spin: number
}

export interface RollFieldState {
  particles: RollParticle[]
  offset: number
  spinTick: number
}

// Scratch row buffers reused across frames: this renders on every tumble frame
// (110-210ms holds), so per-call allocation is the one hot path in the file.
const scratchRows: Map<number, string>[] = Array.from(
  { length: ROWS },
  () => new Map<number, string>(),
)

export function makeRollField(seed: number): RollFieldState {
  const rng = mulberry32(seed)
  const particles: RollParticle[] = []
  for (let w = 0; w < FIELD_PERIOD; w++) {
    const count = Math.round(COLS * FIELD_DENSITY)
    for (let i = 0; i < count; i++) {
      const lo = Math.floor((i * COLS) / count)
      const hi = Math.floor(((i + 1) * COLS) / count)
      const col = lo + Math.floor(rng() * Math.max(1, hi - lo))
      const pick = rng()
      if (pick < 0.4) {
        particles.push({
          col,
          row: w,
          kind: 'corner',
          glyph: '',
          spin: Math.floor(rng() * SPIN_CW.length),
        })
      } else {
        // Every non-corner particle carries a shape; at speed it renders as a
        // ▕ streak and resolves back to this shape when the field slows —
        // permanently-line particles would leave stray streaks on the slow
        // settle frame.
        particles.push({
          col,
          row: w,
          kind: 'gem',
          glyph: GEMS[Math.floor(rng() * GEMS.length)],
          spin: 0,
        })
      }
    }
  }
  return { particles, offset: 0, spinTick: 0 }
}

/**
 * Advance the field by `velocity` rows (0 = frozen: nothing moves and the
 * corners stop spinning) and render it. Mutates state.
 */
export function makeRollFieldFrame(
  state: RollFieldState,
  velocity: number,
): string {
  state.offset += velocity
  if (velocity > 0) state.spinTick += 1

  const visRows = ROWS - 1
  const cellsByRow = scratchRows
  for (const m of cellsByRow) m.clear()
  for (const p of state.particles) {
    const m =
      (((p.row + state.offset) % FIELD_PERIOD) + FIELD_PERIOD) % FIELD_PERIOD
    if (m >= visRows) continue
    const r = 1 + m
    // The die occludes debris passing behind it.
    const isCoinBand = r >= COIN_ROW_TOP && r <= COIN_ROW_BOT
    if (isCoinBand && p.col >= COIN_COL_LEFT && p.col <= COIN_COL_RIGHT) continue

    let glyph: string
    if (p.kind === 'corner') {
      glyph = SPIN_CW[(p.spin + state.spinTick) % SPIN_CW.length]
    } else if (velocity >= BLUR_VELOCITY) {
      glyph = STREAK
    } else {
      glyph = p.glyph
    }
    cellsByRow[r].set(p.col, glyph)
  }

  const lines: string[] = []
  for (let r = 0; r < ROWS; r++) {
    if (r === 0) {
      lines.push('')
      continue
    }
    const cells = cellsByRow[r]
    lines.push(layoutRow(c => cells.get(c) ?? null))
  }
  return lines.join('\n')
}
