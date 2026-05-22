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
  TALLY_INNER_W,
  makeBgDrizzle,
  makeStatusBar,
  makeTallyBar,
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
import { activateKeepAlive, isKeepAliveActive } from './keepAlive'
import { spreadText } from './text'
import { setupPreview, setupToggle, primeToggle } from './preview'
import {
  loadTally,
  saveTally,
  formatHeads,
  formatTails,
  loadBgEnabled,
  saveBgEnabled,
  loadTallyEnabled,
  saveTallyEnabled,
  loadResetOnStartup,
  saveResetOnStartup,
  peekBgEnabled,
  peekTallyEnabled,
  peekResetOnStartup,
  type Tally,
} from './storage'

const DRIZZLE_TICK_MS = 700
const BG_BLANK = ' '
const TALLY_BLANK = ' '
// Pull the right tally text in from the absolute edge so font-width prediction
// error across the gap can't clip its last glyph.
const TALLY_RIGHT_MARGIN = 20

const versionEl = document.getElementById('app-version')
if (versionEl) versionEl.textContent = `v${__APP_VERSION__}`

// Reflect saved toggle prefs immediately (synchronous localStorage read) so they
// don't flash their default while the async startup runs.
primeToggle('bg-toggle', peekBgEnabled())
primeToggle('tally-toggle', peekTallyEnabled())
primeToggle('reset-startup-toggle', peekResetOnStartup())

const bridge = await waitForEvenAppBridge()
const assets = await loadCoinAssets(COIN_W, bridge)
const preview = setupPreview()
const tally: Tally = await loadTally(bridge)

let currentPhase: DrizzlePhase = 'idle'
let drizzleSeed = Math.floor(Math.random() * 0xffffffff)
let bgEnabled = await loadBgEnabled(bridge)
let tallyEnabled = await loadTallyEnabled(bridge)

const resetOnStartup = await loadResetOnStartup(bridge)
if (resetOnStartup) {
  tally.heads = 0
  tally.tails = 0
  saveTally(bridge, tally)
}

const createResult = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 4,
    textObject: [
      makeBgDrizzle(makeInitialDrizzleFrame()),
      makeStatusBar(IDLE_STATUS),
      makeTallyBar(tallyEnabled ? tallyLine() : TALLY_BLANK),
    ],
    imageObject: [makeCoinImage()],
  }),
)

if (createResult !== 0) {
  console.error('createStartUpPageContainer failed:', createResult)
}

preview?.updateStatus(IDLE_STATUS)
preview?.updateTally(
  tallyEnabled ? formatHeads(tally) : '',
  tallyEnabled ? formatTails(tally) : '',
)
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

function sendDrizzleContent(content: string): Promise<unknown> {
  preview?.updateDrizzle(content)
  return enqueue(() =>
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

// Skip a tick if the previous drizzle write hasn't landed yet, so a slow/stalled
// BLE link can never accumulate a backlog of frames that drains slowly.
let drizzleInFlight = false
function sendDrizzleFrame(): void {
  if (drizzleInFlight) return
  drizzleInFlight = true
  drizzleSeed = (drizzleSeed + 1) >>> 0
  void sendDrizzleContent(makeDrizzleFrame(currentPhase, drizzleSeed)).finally(
    () => {
      drizzleInFlight = false
    },
  )
}

function tallyLine(): string {
  return spreadText(
    formatHeads(tally),
    formatTails(tally),
    TALLY_INNER_W - TALLY_RIGHT_MARGIN,
  )
}

function updateTallyDisplay(): void {
  preview?.updateTally(
    tallyEnabled ? formatHeads(tally) : '',
    tallyEnabled ? formatTails(tally) : '',
  )
  void enqueue(() =>
    bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: IDS.tallyBar,
        containerName: NAMES.tallyBar,
        content: tallyEnabled ? tallyLine() : TALLY_BLANK,
        contentOffset: 0,
        contentLength: 0,
      }),
    ),
  )
}

const flip = createFlipController({
  bridge,
  assets,
  setPhase(phase) {
    currentPhase = phase
    if (bgEnabled) sendDrizzleFrame()
  },
  onResult(result) {
    if (result === 'heads') tally.heads += 1
    else tally.tails += 1
    saveTally(bridge, tally)
    updateTallyDisplay()
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
    void sendDrizzleContent(BG_BLANK)
  }
}

setupToggle('bg-toggle', bgEnabled, enabled => {
  saveBgEnabled(bridge, enabled)
  applyBgEnabled(enabled)
})
applyBgEnabled(bgEnabled)

setupToggle('tally-toggle', tallyEnabled, enabled => {
  tallyEnabled = enabled
  saveTallyEnabled(bridge, enabled)
  updateTallyDisplay()
})

setupToggle('reset-startup-toggle', resetOnStartup, enabled => {
  saveResetOnStartup(bridge, enabled)
})

document.getElementById('tally-reset')?.addEventListener('click', () => {
  tally.heads = 0
  tally.tails = 0
  saveTally(bridge, tally)
  updateTallyDisplay()
})

function showExitDialog(): void {
  void bridge.shutDownPageContainer(1)
}

// Pause background animation while the app is hidden/locked. Otherwise the
// drizzle ticker keeps queuing BLE writes that can't complete (timers throttle,
// BLE stalls), piling up a backlog that drains slowly on resume and makes the
// app feel sluggish.
function pauseActivity(): void {
  stopDrizzleTicker()
}

function resumeActivity(): void {
  startDrizzleTicker()
}

// Device lock / app switch does not always fire the SDK foreground events, but
// it does flip document visibility — cover that path too.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseActivity()
  else resumeActivity()
})

let unsubscribe: () => void

function handleBridgeEvent(event: EvenHubEvent): void {
  const hasSys = event.sysEvent !== undefined
  const sysType = event.sysEvent?.eventType ?? null
  const textType = event.textEvent?.eventType ?? null

  if (sysType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
    resumeActivity()
    return
  }
  if (sysType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
    pauseActivity()
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

  // First user gesture activates the WebView keep-alive. Must run from a gesture
  // context (autoplay policy), so it lives here on the input path.
  if (
    (isSingleClick || isDoubleClick || isSwipeUp || isSwipeDown) &&
    !isKeepAliveActive()
  ) {
    activateKeepAlive()
  }

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
