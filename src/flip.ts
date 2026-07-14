import {
  EvenAppBridge,
  ImageRawDataUpdate,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk'
import { CANVAS_W, IDS, NAMES } from './layout'
import type { CoinAssets, CoinFrame } from './assets'
import type { DrizzlePhase } from './drizzle'
import { enqueue } from './bridgeQueue'
import { centerText } from './text'
import type { Preview } from './preview'

const STATUS_PAD = 4
const STATUS_INNER_W = CANVAS_W - 2 * STATUS_PAD

export const IDLE_STATUS = centerText(
  '↑  Swipe up to flip  ↑',
  STATUS_INNER_W,
)
const STATUS_HEADS = centerText('↑  HEADS  ↑', STATUS_INNER_W)
const STATUS_TAILS = centerText('↑  TAILS  ↑', STATUS_INNER_W)
const STATUS_BLANK = ' '

const ROTATIONS = 1
const FRAME_HOLD_MS = 120

export interface FlipController {
  trigger(): void
  isResultShowing(): boolean
  dismissResult(): Promise<void>
}

interface Deps {
  bridge: EvenAppBridge
  assets: CoinAssets
  setPhase(phase: DrizzlePhase): void
  onResult(result: 'heads' | 'tails'): void
  preview?: Preview | null
}

export function createFlipController({
  bridge,
  assets,
  setPhase,
  onResult,
  preview,
}: Deps): FlipController {
  let busy = false
  let resultShowing = false

  const sendImage = (frame: CoinFrame) => {
    preview?.updateCoin(assets[frame])
    return enqueue(() =>
      bridge.updateImageRawData(
        new ImageRawDataUpdate({
          containerID: IDS.coinImage,
          containerName: NAMES.coinImage,
          imageData: assets[frame],
        }),
      ),
    )
  }

  const setStatus = (content: string) => {
    preview?.updateStatus(content)
    return enqueue(() =>
      bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: IDS.statusBar,
          containerName: NAMES.statusBar,
          content,
          contentOffset: 0,
          contentLength: 0,
        }),
      ),
    )
  }

  const delay = (ms: number) =>
    new Promise<void>(resolve => setTimeout(resolve, ms))

  async function runFlip(): Promise<void> {
    busy = true
    // Swipe feedback: rain up-arrows and clear the status. setPhase runs
    // synchronously with the swipe; the blank follows so the coin tumbles
    // against an empty status bar until the result lands.
    setPhase('up')
    await setStatus(STATUS_BLANK)

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
      await sendImage(frames[i])
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

    resultShowing = true
    busy = false
  }

  return {
    trigger() {
      if (busy) return
      if (resultShowing) {
        resultShowing = false
      }
      void runFlip().catch(err => {
        console.error('Flip failed:', err)
        busy = false
      })
    },
    isResultShowing() {
      return resultShowing
    },
    async dismissResult() {
      if (!resultShowing) return
      resultShowing = false
      await setStatus(IDLE_STATUS)
    },
  }
}
