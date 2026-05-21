import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  ImageRawDataUpdate,
  TextContainerUpgrade,
  OsEventTypeList,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import {
  COIN_W,
  IDS,
  NAMES,
  makeBgDrizzle,
  makeStatusBar,
  makeCoinImage,
} from './layout'
import {
  makeDrizzleFrame,
  makeInitialDrizzleFrame,
  type DrizzlePhase,
} from './drizzle'
import { loadCoinAssets } from './assets'
import { createFlipController, IDLE_STATUS } from './flip'
import { enqueue } from './bridgeQueue'
import { setupPreview, setupBgToggle } from './preview'

const DRIZZLE_TICK_MS = 700
const BG_BLANK = ' '

const versionEl = document.getElementById('app-version')
if (versionEl) versionEl.textContent = `v${__APP_VERSION__}`

const bridge = await waitForEvenAppBridge()
const assets = await loadCoinAssets(COIN_W, bridge)
const preview = setupPreview()

let currentPhase: DrizzlePhase = 'idle'
let drizzleSeed = Math.floor(Math.random() * 0xffffffff)
let bgEnabled = true

const createResult = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 3,
    textObject: [
      makeBgDrizzle(makeInitialDrizzleFrame()),
      makeStatusBar(IDLE_STATUS),
    ],
    imageObject: [makeCoinImage()],
  }),
)

if (createResult !== 0) {
  console.error('createStartUpPageContainer failed:', createResult)
}

preview?.updateStatus(IDLE_STATUS)
preview?.updateCoin(assets.heads)

await enqueue(() =>
  bridge.updateImageRawData(
    new ImageRawDataUpdate({
      containerID: IDS.coinImage,
      containerName: NAMES.coinImage,
      imageData: assets.heads,
    }),
  ),
)

function sendDrizzleContent(content: string): void {
  preview?.updateDrizzle(content)
  void enqueue(() =>
    bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: IDS.bgDrizzle,
        containerName: NAMES.bgDrizzle,
        content,
        contentOffset: 0,
        contentLength: 0,
      }),
    ),
  )
}

function sendDrizzleFrame(): void {
  drizzleSeed = (drizzleSeed + 1) >>> 0
  sendDrizzleContent(makeDrizzleFrame(currentPhase, drizzleSeed))
}

const flip = createFlipController({
  bridge,
  assets,
  setPhase(phase) {
    currentPhase = phase
  },
  preview,
})

let drizzleTimer: ReturnType<typeof setInterval> | null = null

function startDrizzleTicker(): void {
  if (drizzleTimer !== null) return
  if (!bgEnabled) return
  drizzleTimer = setInterval(() => {
    sendDrizzleFrame()
  }, DRIZZLE_TICK_MS)
}

function stopDrizzleTicker(): void {
  if (drizzleTimer === null) return
  clearInterval(drizzleTimer)
  drizzleTimer = null
}

function applyBgEnabled(enabled: boolean): void {
  bgEnabled = enabled
  if (enabled) {
    sendDrizzleFrame()
    startDrizzleTicker()
  } else {
    stopDrizzleTicker()
    sendDrizzleContent(BG_BLANK)
  }
}

applyBgEnabled(setupBgToggle(applyBgEnabled))

function showExitDialog(): void {
  void bridge.shutDownPageContainer(1)
}

let unsubscribe: () => void

function handleBridgeEvent(event: EvenHubEvent): void {
  const hasSys = event.sysEvent !== undefined
  const sysType = event.sysEvent?.eventType ?? null
  const textType = event.textEvent?.eventType ?? null

  if (sysType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
    startDrizzleTicker()
    return
  }
  if (sysType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
    stopDrizzleTicker()
    return
  }
  if (
    sysType === OsEventTypeList.SYSTEM_EXIT_EVENT ||
    sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT
  ) {
    stopDrizzleTicker()
    unsubscribe()
    return
  }

  const isSingleClick = hasSys && sysType === null
  const isDoubleClick = sysType === OsEventTypeList.DOUBLE_CLICK_EVENT
  const isSwipeUp = textType === OsEventTypeList.SCROLL_TOP_EVENT
  const isSwipeDown = textType === OsEventTypeList.SCROLL_BOTTOM_EVENT

  if (flip.isResultShowing()) {
    if (isSwipeUp) {
      flip.trigger()
    } else if (isSingleClick || isDoubleClick || isSwipeDown) {
      void flip.dismissResult()
    }
    return
  }

  if (isDoubleClick) {
    showExitDialog()
    return
  }
  if (isSwipeUp) {
    flip.trigger()
    return
  }
}

unsubscribe = bridge.onEvenHubEvent(handleBridgeEvent)
