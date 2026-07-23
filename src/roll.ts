import { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { DieAssets } from './dice'
import type { DrizzlePhase } from './drizzle'
import { sendText, sendImage as sendImageTo } from './send'
import {
  createSurfaceLifecycle,
  delay,
  STATUS_BLANK,
  STATUS_INNER_W,
} from './surface'
import { centerText } from './text'
import type { Preview } from './preview'

export const ROLL_IDLE_STATUS = centerText(
  '↑  Swipe up to roll  ↑',
  STATUS_INNER_W,
)
// Roll timeline: the debris field streams down fast and decelerates with the
// die (longer frame holds, lower field velocity). The iso tumble frames all
// run at streak velocity (≥2), so the field shows motion lines the whole time
// the die is airborne. The settle frame — the result face tilted 45° — drops
// to velocity 1: the streaks resolve into shapes the moment it appears, and
// the extra field pulses radiate them outward from the die — an impact burst —
// through its hold. The field then holds those shapes until the landing
// frame (face flat) is on screen; only after that final image lands does the
// ambient 'landed' dot drizzle take over.
const HOLDS = [110, 150, 210]
/** Field velocity (rows per update) per tumble frame, parallel to HOLDS. All
 *  at or above the streak threshold so motion lines persist until the settle. */
const VELOCITIES = [3, 2, 2]
/** Below the streak threshold: the settle frame shows shapes, not lines. */
const SETTLE_VELOCITY = 1
const SETTLE_PULSES = 2
const SETTLE_PULSE_MS = 150

/** Unbiased 1..faces from crypto randomness (rejection sampling). */
export function rollValue(faces: number): number {
  const limit = 256 - (256 % faces)
  const buf = new Uint8Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return (buf[0] % faces) + 1
  }
}

interface TumbleStep {
  value: number
  pose: number
}

// Pseudo-random faces for the tumble: no face repeats back-to-back, the last
// airborne face never matches the result (the reveal happens on the settle
// frame), and the POSE also changes on every frame — the die must visibly
// turn between frames, so pips never swap on an identical silhouette. The
// final tumble frame uses one of the large axis-aligned poses so its
// silhouette flows into the full-size settle face rather than jumping up from
// a shrunken diagonal. (Math.random is fine here — only the look; the outcome
// itself comes from rollValue.)
function tumbleSequence(
  frames: number,
  faces: number,
  result: number,
  poseCount: number,
  largePoses: readonly number[],
): TumbleStep[] {
  const steps: TumbleStep[] = []
  let prevValue = 0
  let prevPose = -1
  for (let i = 0; i < frames; i++) {
    const isLast = i === frames - 1
    let value: number
    do {
      value = 1 + Math.floor(Math.random() * faces)
    } while (value === prevValue || (isLast && value === result))
    let pose: number
    do {
      pose = isLast
        ? largePoses[Math.floor(Math.random() * largePoses.length)]
        : Math.floor(Math.random() * poseCount)
    } while (pose === prevPose)
    prevValue = value
    prevPose = pose
    steps.push({ value, pose })
  }
  return steps
}

export interface RollController {
  trigger(): void
  isResultShowing(): boolean
  /** True while the tumble animation is mid-flight and owns the display. */
  isBusy(): boolean
  dismissResult(): Promise<void>
  /** Drop the result state without touching the display — for callers that are
   *  about to repaint the canvas themselves (the settings menu). */
  clearResult(): void
}

interface Deps {
  bridge: EvenAppBridge
  /** Current die's assets; resolved per roll so a die-size change mid-session
   *  always rolls the newly selected die. */
  getAssets(): Promise<DieAssets>
  /** For 'motion', the second argument is the field velocity in rows/update. */
  setPhase(phase: DrizzlePhase, velocity?: number): void
  /** Update counts and on-screen state. Runs on the last frame, in the critical path. */
  onResult(value: number): void
  /** Persist state. Runs after the animation, so its bridge write can't delay a die frame. */
  onSettled?(): void
  preview?: Preview | null
}

export function createRollController({
  bridge,
  getAssets,
  setPhase,
  onResult,
  onSettled,
  preview,
}: Deps): RollController {
  const sendImage = (bytes: Uint8Array) => {
    preview?.updateCoin(bytes)
    return sendImageTo(bridge, 'coinImage', bytes)
  }

  const setStatus = (content: string) => {
    preview?.updateStatus(content)
    return sendText(bridge, 'statusBar', content)
  }

  async function runRoll(): Promise<void> {
    // Swipe feedback: the debris field starts streaming immediately (entering
    // 'motion' from another phase seeds a fresh field).
    setPhase('motion', VELOCITIES[0])
    const assetsPromise = getAssets()
    await setStatus(STATUS_BLANK)

    const assets = await assetsPromise
    const value = rollValue(assets.faces)
    // Kick off every frame build up front so they render while earlier ones
    // are on screen; the settle and result faces composite during the tumble.
    const isoFrames = HOLDS.length
    const steps = tumbleSequence(
      isoFrames,
      assets.faces,
      value,
      assets.poseCount,
      assets.largePoses,
    )
    const stepPromises = steps.map(s => assets.tumble(s.value, s.pose))
    const settlePromise = assets.faceSettle(value)
    const facePromise = assets.face(value)

    const holdFrame = async (i: number, image: Uint8Array) => {
      setPhase('motion', VELOCITIES[i])
      const sentAt = Date.now()
      await sendImage(image)
      // Same pacing trick as the coin: the send itself holds the frame, so only
      // pad out whatever time the BLE round trip didn't already consume.
      const remaining = HOLDS[i] - (Date.now() - sentAt)
      if (remaining > 0) await delay(remaining)
    }

    for (let i = 0; i < isoFrames; i++) {
      await holdFrame(i, await stepPromises[i])
    }

    // Settle frame: the die has landed on the result but sits tilted 45° —
    // the landing frame then rotates it flat into its resting position. The
    // field sheds its streaks for shapes on this frame, and the extra pulses
    // keep them drifting through the hold.
    setPhase('motion', SETTLE_VELOCITY)
    await sendImage(await settlePromise)
    for (let p = 0; p < SETTLE_PULSES; p++) {
      await delay(SETTLE_PULSE_MS)
      setPhase('motion', SETTLE_VELOCITY)
    }

    // Landing frame: the field stays frozen on its settle shapes while the
    // status and face writes are on the wire, and only once the face is on
    // screen does the ambient drizzle return — switching phases any earlier
    // stamps dots over the field while the settle frame is still showing.
    onResult(value)
    await setStatus(centerText(`↑  ROLLED ${value}  ↑`, STATUS_INNER_W))
    await sendImage(await facePromise)
    setPhase('landed')
  }

  const lifecycle = createSurfaceLifecycle({
    label: 'Roll',
    idleStatus: ROLL_IDLE_STATUS,
    setStatus,
    setPhase,
    onSettled,
  })

  return {
    trigger: () => lifecycle.trigger(runRoll),
    isResultShowing: lifecycle.isResultShowing,
    isBusy: lifecycle.isBusy,
    clearResult: lifecycle.clearResult,
    dismissResult: lifecycle.dismissResult,
  }
}
