import { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { CoinAssets, CoinFrame } from './assets'
import type { DrizzlePhase } from './drizzle'
import { sendText, sendImage } from './send'
import {
  createSurfaceLifecycle,
  delay,
  STATUS_BLANK,
  STATUS_INNER_W,
} from './surface'
import { centerText } from './text'
import type { Preview } from './preview'

export const IDLE_STATUS = centerText(
  '↑  Swipe up to flip  ↑',
  STATUS_INNER_W,
)
const STATUS_HEADS = centerText('↑  HEADS  ↑', STATUS_INNER_W)
const STATUS_TAILS = centerText('↑  TAILS  ↑', STATUS_INNER_W)

const ROTATIONS = 1
const FRAME_HOLD_MS = 120

export interface FlipController {
  trigger(): void
  isResultShowing(): boolean
  /** True while the tumble animation is mid-flight and owns the display. */
  isBusy(): boolean
  dismissResult(): Promise<void>
  /** Drop the result state without touching the display — for callers that are
   *  about to repaint the canvas themselves (the settings menu). */
  clearResult(): void
  /** Last coin frame written, so a caller can restore it after covering it. */
  currentFrame(): CoinFrame
}

interface Deps {
  bridge: EvenAppBridge
  /** Coin assets, resolved per flip so startup never blocks on the coin art. */
  getAssets(): Promise<CoinAssets>
  setPhase(phase: DrizzlePhase): void
  /** Update counts and on-screen state. Runs on the last frame, in the critical path. */
  onResult(result: 'heads' | 'tails'): void
  /** Persist state. Runs after the animation, so its bridge write can't delay a coin frame. */
  onSettled?(): void
  preview?: Preview | null
}

export function createFlipController({
  bridge,
  getAssets,
  setPhase,
  onResult,
  onSettled,
  preview,
}: Deps): FlipController {
  let lastFrame: CoinFrame = 'heads'

  const sendCoinFrame = (assets: CoinAssets, frame: CoinFrame) => {
    lastFrame = frame
    preview?.updateCoin(assets[frame])
    return sendImage(bridge, 'coinImage', assets[frame])
  }

  const setStatus = (content: string) => {
    preview?.updateStatus(content)
    return sendText(bridge, 'statusBar', content)
  }

  async function runFlip(): Promise<void> {
    // Swipe feedback: rain up-arrows and clear the status. setPhase runs
    // synchronously with the swipe; the blank follows so the coin tumbles
    // against an empty status bar until the result lands.
    setPhase('up')
    const assetsPromise = getAssets()
    await setStatus(STATUS_BLANK)
    const assets = await assetsPromise

    // 256 possible byte values split exactly in half at 128 — no bias.
    const result: 'heads' | 'tails' =
      crypto.getRandomValues(new Uint8Array(1))[0] < 128 ? 'heads' : 'tails'

    const settle: CoinFrame =
      result === 'heads' ? 'headsHalf' : 'tailsHalf'
    const rotated: CoinFrame =
      result === 'heads' ? 'tailsHalfRotated' : 'headsHalfRotated'
    const frames: CoinFrame[] = []
    for (let r = 0; r < ROTATIONS; r++) {
      frames.push(rotated, settle, settle)
    }
    frames[frames.length - 1] = result

    const apexIdx = Math.floor(frames.length / 2)

    for (let i = 0; i < frames.length; i++) {
      const isLast = i === frames.length - 1
      const phase: DrizzlePhase = isLast
        ? 'landed'
        : i < apexIdx
          ? 'up'
          : 'down'

      setPhase(phase)
      if (isLast) {
        // Record + show the result together so the tally updates in sync.
        onResult(result)
        await setStatus(result === 'heads' ? STATUS_HEADS : STATUS_TAILS)
      }
      const sentAt = Date.now()
      await sendCoinFrame(assets, frames[i])
      if (!isLast) {
        // Hold each frame ~FRAME_HOLD_MS, but the send itself already keeps this
        // frame on-screen (the next frame doesn't render until its own send lands),
        // so only pad the time the send didn't already consume. On a slow BLE link
        // this drops the redundant wait — the tumble refreshes faster — while a fast
        // link still paces to FRAME_HOLD_MS. Frame pixels are untouched.
        const remaining = FRAME_HOLD_MS - (Date.now() - sentAt)
        if (remaining > 0) await delay(remaining)
      }
    }
  }

  const lifecycle = createSurfaceLifecycle({
    label: 'Flip',
    idleStatus: IDLE_STATUS,
    setStatus,
    setPhase,
    onSettled,
  })

  return {
    trigger: () => lifecycle.trigger(runFlip),
    isResultShowing: lifecycle.isResultShowing,
    isBusy: lifecycle.isBusy,
    clearResult: lifecycle.clearResult,
    dismissResult: lifecycle.dismissResult,
    currentFrame() {
      return lastFrame
    },
  }
}
