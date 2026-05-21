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
  '△  Swipe up to flip  △',
  STATUS_INNER_W,
)
const STATUS_FLIPPING = centerText('flipping', STATUS_INNER_W)
const STATUS_LANDING = centerText('landing', STATUS_INNER_W)
const STATUS_HEADS = centerText('>>  HEADS  <<', STATUS_INNER_W)
const STATUS_TAILS = centerText('>>  TAILS  <<', STATUS_INNER_W)
const STATUS_BLANK = ' '

const ROTATIONS = 1
const FRAME_HOLD_MS = 120
const BLINK_MS = 500

export interface FlipController {
  trigger(): void
  isResultShowing(): boolean
  dismissResult(): Promise<void>
}

interface Deps {
  bridge: EvenAppBridge
  assets: CoinAssets
  setPhase(phase: DrizzlePhase): void
  preview?: Preview | null
}

export function createFlipController({
  bridge,
  assets,
  setPhase,
  preview,
}: Deps): FlipController {
  let busy = false
  let resultShowing = false
  let blinkTimer: ReturnType<typeof setInterval> | null = null

  function clearBlink(): void {
    if (blinkTimer !== null) {
      clearInterval(blinkTimer)
      blinkTimer = null
    }
  }

  function startBlink(resultText: string): void {
    clearBlink()
    let on = true
    blinkTimer = setInterval(() => {
      on = !on
      void setStatus(on ? resultText : STATUS_BLANK)
    }, BLINK_MS)
  }

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
    const result: CoinFrame = Math.random() < 0.5 ? 'heads' : 'tails'

    const settle: CoinFrame =
      result === 'heads' ? 'headsHalf' : 'tailsHalf'
    const frames: CoinFrame[] = []
    for (let r = 0; r < ROTATIONS; r++) {
      frames.push(
        'headsHalf',
        'headsHalfRotated',
        'tailsHalfRotated',
        settle,
        settle,
      )
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
      const status = isLast
        ? result === 'heads'
          ? STATUS_HEADS
          : STATUS_TAILS
        : phase === 'up'
          ? STATUS_FLIPPING
          : STATUS_LANDING

      setPhase(phase)
      await setStatus(status)
      await sendImage(frames[i])
      if (!isLast) await delay(FRAME_HOLD_MS)
    }

    resultShowing = true
    busy = false
    startBlink(result === 'heads' ? STATUS_HEADS : STATUS_TAILS)
  }

  return {
    trigger() {
      if (busy) return
      if (resultShowing) {
        resultShowing = false
        clearBlink()
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
      clearBlink()
      await setStatus(IDLE_STATUS)
    },
  }
}
