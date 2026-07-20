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
  makeInputCapture,
  makeStatusBar,
  makeTallyBar,
  makeCoinImage,
} from './layout'
import {
  makeDrizzleFrame,
  makeInitialDrizzleFrame,
  type DrizzlePhase,
} from './drizzle'
import { loadCoinAssets, makeBlankImage } from './assets'
import { createFlipController, IDLE_STATUS } from './flip'
import { createMenuController } from './menu'
import { enqueue } from './bridgeQueue'
import { patchImageCompressModeBug } from './sdkPatch'
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

// Must run before the first updateImageRawData, or the coin never renders on
// SDK 0.0.12. See sdkPatch.ts.
patchImageCompressModeBug()

const bridge = await waitForEvenAppBridge()
const assets = await loadCoinAssets(COIN_W, bridge)
const preview = setupPreview()
const tally: Tally = await loadTally(bridge)

let currentPhase: DrizzlePhase = 'idle'
let drizzleSeed = Math.floor(Math.random() * 0xffffffff)
let bgEnabled = await loadBgEnabled(bridge)
let tallyEnabled = await loadTallyEnabled(bridge)

let resetOnStartup = await loadResetOnStartup(bridge)
if (resetOnStartup) {
  tally.heads = 0
  tally.tails = 0
  saveTally(bridge, tally)
}

const createResult = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 5,
    textObject: [
      makeInputCapture(),
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
  // The tally bar overlays the top of the menu, so hold the glasses write while
  // the menu is up — toggling the tally from there would otherwise stamp the
  // counts across the title row. onClose repaints it with the final state.
  if (menu.isOpen()) return
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
  // One rain repaint immediately before every coin frame. The repeat write
  // within a phase is not redundant: it reseeds the glyph positions, so the rain
  // animates in lockstep with the tumble. Deduplicating it froze the rain
  // through the ascent and threw the timing off.
  setPhase(phase) {
    currentPhase = phase
    if (bgEnabled) sendDrizzleFrame()
  },
  onResult(result) {
    if (result === 'heads') tally.heads += 1
    else tally.tails += 1
    updateTallyDisplay()
  },
  onSettled() {
    saveTally(bridge, tally)
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

// Each setting has one setter, shared by the phone toggles and the on-glasses
// settings menu, so a change from either surface persists and is reflected in
// the other. `fromPhone` skips writing the checkbox that just fired the change.
function setBgEnabled(enabled: boolean, fromPhone = false): void {
  saveBgEnabled(bridge, enabled)
  applyBgEnabled(enabled)
  if (!fromPhone) primeToggle('bg-toggle', enabled)
}

function setTallyEnabled(enabled: boolean, fromPhone = false): void {
  tallyEnabled = enabled
  saveTallyEnabled(bridge, enabled)
  updateTallyDisplay()
  if (!fromPhone) primeToggle('tally-toggle', enabled)
}

function setResetOnStartup(enabled: boolean, fromPhone = false): void {
  resetOnStartup = enabled
  saveResetOnStartup(bridge, enabled)
  if (!fromPhone) primeToggle('reset-startup-toggle', enabled)
}

setupToggle('bg-toggle', bgEnabled, enabled => setBgEnabled(enabled, true))
applyBgEnabled(bgEnabled)

setupToggle('tally-toggle', tallyEnabled, enabled =>
  setTallyEnabled(enabled, true),
)

setupToggle('reset-startup-toggle', resetOnStartup, enabled =>
  setResetOnStartup(enabled, true),
)

function resetTally(): void {
  tally.heads = 0
  tally.tails = 0
  saveTally(bridge, tally)
  updateTallyDisplay()
}

document.getElementById('tally-reset')?.addEventListener('click', resetTally)

const menu = createMenuController({
  bridge,
  preview,
  blankImage: makeBlankImage(COIN_W),
  items: [
    {
      label: 'Background',
      getValue: () => bgEnabled,
      onSelect: () => setBgEnabled(!bgEnabled),
    },
    {
      label: 'Tally counter',
      getValue: () => tallyEnabled,
      onSelect: () => setTallyEnabled(!tallyEnabled),
    },
    {
      label: 'Reset tally at start',
      getValue: () => resetOnStartup,
      onSelect: () => setResetOnStartup(!resetOnStartup),
    },
    {
      label: 'Reset current tally',
      // The tally bar is hidden behind the menu, so echo the counts on the row
      // itself — otherwise a reset gives no visible confirmation.
      getValue: () => `${tally.heads} / ${tally.tails}`,
      onSelect: resetTally,
    },
    // exitMode 1 — hand off to the ER exit prompt. exitMode 0 claims to quit
    // immediately but leaves the app not fully closed, so the prompt is the
    // reliable teardown path.
    { label: 'Exit', onSelect: () => void bridge.shutDownPageContainer(1) },
  ],
  onOpen() {
    // The menu owns the whole canvas: stop the drizzle ticker so it can't
    // overwrite the rows, and drop any result state we're painting over.
    stopDrizzleTicker()
    flip.clearResult()
    void enqueue(() =>
      bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: IDS.tallyBar,
          containerName: NAMES.tallyBar,
          content: TALLY_BLANK,
          contentOffset: 0,
          contentLength: 0,
        }),
      ),
    )
    preview?.updateTally('', '')
  },
  onClose() {
    preview?.updateCoin(assets[flip.currentFrame()])
    void enqueue(() =>
      bridge.updateImageRawData(
        new ImageRawDataUpdate({
          containerID: IDS.coinImage,
          containerName: NAMES.coinImage,
          imageData: assets[flip.currentFrame()],
        }),
      ),
    )
    preview?.updateStatus(IDLE_STATUS)
    void enqueue(() =>
      bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: IDS.statusBar,
          containerName: NAMES.statusBar,
          content: IDLE_STATUS,
          contentOffset: 0,
          contentLength: 0,
        }),
      ),
    )
    updateTallyDisplay()
    // applyBgEnabled repaints the drizzle (or blanks it) and restarts the ticker,
    // clearing the menu rows out of the full-canvas container either way.
    applyBgEnabled(bgEnabled)
  },
})

// Pause background animation while the app is hidden/locked. Otherwise the
// drizzle ticker keeps queuing BLE writes that can't complete (timers throttle,
// BLE stalls), piling up a backlog that drains slowly on resume and makes the
// app feel sluggish.
function pauseActivity(): void {
  stopDrizzleTicker()
}

function resumeActivity(): void {
  // Not while the settings menu is up — the ticker writes to the same
  // full-canvas container the menu rows live in.
  if (menu.isOpen()) return
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

  // Double-tap opens the settings menu from the coin view and closes it again
  // from inside — it's the back gesture. Exiting the app is the menu's Exit row.
  // Handled inline and ahead of everything else so the gesture is never
  // swallowed. Cleanup runs in the SYSTEM_EXIT_EVENT / ABNORMAL_EXIT_EVENT
  // handlers above, not here.
  if (isDoubleClick) {
    if (menu.isOpen()) menu.close()
    else if (!flip.isBusy()) menu.open()
    return
  }

  if (menu.isOpen()) {
    if (isSwipeUp) menu.moveUp()
    else if (isSwipeDown) menu.moveDown()
    else if (isSingleClick) menu.select()
    return
  }

  if (flip.isResultShowing()) {
    if (isSwipeUp) {
      flip.trigger()
    } else if (isSingleClick || isSwipeDown) {
      void flip.dismissResult()
    }
    return
  }

  if (isSwipeUp) {
    flip.trigger()
    return
  }
}

unsubscribe = bridge.onEvenHubEvent(handleBridgeEvent)
