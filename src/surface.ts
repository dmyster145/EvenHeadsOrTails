// Scaffolding shared by the flip and roll controllers: status-bar geometry,
// frame pacing, and the busy/result lifecycle wrapped around an animation.
// The two controllers used to carry independent copies of all of this; a fix
// to the recovery or pacing logic had to be applied twice by hand.

import type { DrizzlePhase } from './drizzle'
import { CANVAS_W } from './layout'

const STATUS_PAD = 4
export const STATUS_INNER_W = CANVAS_W - 2 * STATUS_PAD
// A real space, not '' — an empty content string is rejected by the firmware.
export const STATUS_BLANK = ' '

export const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

export interface SurfaceLifecycle {
  isBusy(): boolean
  isResultShowing(): boolean
  clearResult(): void
  dismissResult(): Promise<void>
  /** Run the animation if idle; no-op while one is already in flight. */
  trigger(run: () => Promise<void>): void
}

interface Deps {
  /** For error logs ('Flip', 'Roll'). */
  label: string
  idleStatus: string
  setStatus(content: string): Promise<unknown>
  setPhase(phase: DrizzlePhase, velocity?: number): void
  /** Persist state. Runs after the animation, so its bridge write can't delay
   *  an animation frame. */
  onSettled?(): void
}

export function createSurfaceLifecycle({
  label,
  idleStatus,
  setStatus,
  setPhase,
  onSettled,
}: Deps): SurfaceLifecycle {
  let busy = false
  let resultShowing = false

  return {
    isBusy() {
      return busy
    },
    isResultShowing() {
      return resultShowing
    },
    clearResult() {
      resultShowing = false
    },
    async dismissResult() {
      if (!resultShowing) return
      resultShowing = false
      await setStatus(idleStatus)
    },
    trigger(run) {
      if (busy) return
      resultShowing = false
      busy = true
      run().then(
        () => {
          resultShowing = true
          busy = false
          onSettled?.()
        },
        err => {
          console.error(`${label} failed:`, err)
          busy = false
          // An aborted animation (e.g. a bridge timeout on a stalled link)
          // records no result; converge the display back to idle. These writes
          // queue behind the abandoned frames, so when the link recovers the
          // last thing on screen is the idle prompt, not animation leftovers.
          setPhase('idle')
          void setStatus(idleStatus).catch(() => {})
        },
      )
    },
  }
}
