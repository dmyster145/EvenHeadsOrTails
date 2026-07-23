// Dice-roll motion field: a persistent set of debris particles that stream
// DOWNWARD past the die — the die reads as traveling forward — until it lands.
// On landing the streaks resolve into shapes in place and the field flips to a
// burst radiating away from the die, like debris kicked out on impact. Corner
// glyphs step through their orientations clockwise on every moving update so
// each one appears to spin. The ambient rain lives in drizzle.ts; both render
// on the shared charGrid.

import {
  CELL_W,
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

// When the die lands (velocity drops below the streak threshold) the stream
// converts into a burst: every visible particle keeps its position but its
// motion flips from "falling past the die" to "radiating away from it" —
// debris kicked outward on impact. Positions and directions live in pixel
// space so the spread reads as circular despite the grid's tall cells
// (16px wide, 27px high).
interface BurstParticle {
  x: number
  y: number
  kind: 'corner' | 'gem'
  glyph: string
  spin: number
  /** Unit direction away from the die center, in pixel space. */
  ux: number
  uy: number
}

const ROW_PX = 27
/** Outward travel in pixels per velocity unit per update. */
const BURST_STEP_PX = 20

export interface RollFieldState {
  particles: RollParticle[]
  offset: number
  spinTick: number
  /** Non-null once the field has converted to the landing burst. */
  burst: BurstParticle[] | null
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
  return { particles, offset: 0, spinTick: 0, burst: null }
}

// Convert the stream's currently visible particles into burst particles at
// their on-screen positions, aimed away from the die center.
function captureBurst(state: RollFieldState): BurstParticle[] {
  const cx = ((COIN_COL_LEFT + COIN_COL_RIGHT + 1) / 2) * CELL_W
  const cy = ((COIN_ROW_TOP + COIN_ROW_BOT + 1) / 2) * ROW_PX
  const visRows = ROWS - 1
  const burst: BurstParticle[] = []
  for (const p of state.particles) {
    const m =
      (((p.row + state.offset) % FIELD_PERIOD) + FIELD_PERIOD) % FIELD_PERIOD
    if (m >= visRows) continue
    const r = 1 + m
    const x = p.col * CELL_W + CELL_W / 2
    const y = r * ROW_PX + ROW_PX / 2
    const dx = x - cx
    const dy = y - cy
    const len = Math.hypot(dx, dy)
    burst.push({
      x,
      y,
      kind: p.kind,
      glyph: p.glyph,
      spin: p.spin,
      // A particle dead-center (fully occluded anyway) defaults to rightward.
      ux: len > 0 ? dx / len : 1,
      uy: len > 0 ? dy / len : 0,
    })
  }
  return burst
}

/**
 * Advance the field by `velocity` (0 = frozen: nothing moves and the corners
 * stop spinning) and render it. Mutates state. At streak velocity the field
 * streams downward past the die; once velocity drops below the threshold it
 * converts to the landing burst and radiates outward instead.
 */
export function makeRollFieldFrame(
  state: RollFieldState,
  velocity: number,
): string {
  if (velocity > 0) state.spinTick += 1
  const streaming = velocity >= BLUR_VELOCITY

  const cellsByRow = scratchRows
  for (const m of cellsByRow) m.clear()

  if (streaming) {
    state.burst = null
    state.offset += velocity
    const visRows = ROWS - 1
    for (const p of state.particles) {
      const m =
        (((p.row + state.offset) % FIELD_PERIOD) + FIELD_PERIOD) % FIELD_PERIOD
      if (m >= visRows) continue
      const r = 1 + m
      // The die occludes debris passing behind it.
      const isCoinBand = r >= COIN_ROW_TOP && r <= COIN_ROW_BOT
      if (isCoinBand && p.col >= COIN_COL_LEFT && p.col <= COIN_COL_RIGHT) {
        continue
      }
      const glyph =
        p.kind === 'corner'
          ? SPIN_CW[(p.spin + state.spinTick) % SPIN_CW.length]
          : STREAK
      cellsByRow[r].set(p.col, glyph)
    }
  } else {
    if (!state.burst) {
      // Conversion frame: shapes appear in place; they radiate on the next
      // update so the resolve and the scatter read as two beats.
      state.burst = captureBurst(state)
    } else if (velocity > 0) {
      for (const p of state.burst) {
        p.x += p.ux * BURST_STEP_PX * velocity
        p.y += p.uy * BURST_STEP_PX * velocity
      }
    }
    for (const p of state.burst) {
      const c = Math.floor(p.x / CELL_W)
      const r = Math.floor(p.y / ROW_PX)
      if (c < 0 || c >= COLS || r < 1 || r >= ROWS) continue
      const isCoinBand = r >= COIN_ROW_TOP && r <= COIN_ROW_BOT
      if (isCoinBand && c >= COIN_COL_LEFT && c <= COIN_COL_RIGHT) continue
      const glyph =
        p.kind === 'corner'
          ? SPIN_CW[(p.spin + state.spinTick) % SPIN_CW.length]
          : p.glyph
      cellsByRow[r].set(c, glyph)
    }
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
