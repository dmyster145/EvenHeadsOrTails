// Composition root: creates the bridge, wires the controllers (flip, roll,
// menus, input router, page manager) together, and owns the cross-cutting
// state they share — active mode, drizzle phase, settings, and tallies.

import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import {
  BANNER_H,
  BANNER_W,
  COIN_W,
  TALLY_INNER_W,
  HOME_MENU_INNER_W,
} from './layout'
import { makeDrizzleFrame, type DrizzlePhase } from './drizzle'
import {
  makeRollField,
  makeRollFieldFrame,
  type RollFieldState,
} from './rollField'
import {
  loadCoinAssets,
  loadBannerAsset,
  makeBlankImage,
  type CoinAssets,
} from './assets'
import { DIE_FACES, loadDieAssets, type DieAssets } from './dice'
import { createFlipController, IDLE_STATUS } from './flip'
import { createRollController, ROLL_IDLE_STATUS } from './roll'
import { createMenuController } from './menu'
import { createPageManager } from './pageContainer'
import { createInputRouter, type InputRouter } from './input'
import { sendText, sendImage } from './send'
import { patchImageCompressModeBug } from './sdkPatch'
import { spreadText } from './text'
import {
  setupPreview,
  setupToggle,
  primeToggle,
  setupSelect,
  primeSelect,
} from './preview'
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
  loadDiceMode,
  saveDiceMode,
  loadDiceStats,
  saveDiceStats,
  formatRolls,
  formatLast,
  peekBgEnabled,
  peekTallyEnabled,
  peekResetOnStartup,
  peekDiceMode,
} from './storage'

// Ambient repaint cadence. Slow enough that each ~0.5s BLE text write settles
// well before the next tick (all writes share the serialized bridge queue),
// fast enough that the rain still reads as motion.
const DRIZZLE_TICK_MS = 700
const BG_BLANK = ' '
const TALLY_BLANK = ' '
// Pull the right tally text in from the absolute edge so font-width prediction
// error across the gap can't clip its last glyph.
const TALLY_RIGHT_MARGIN = 20

const MAX_ASSET_LOAD_ATTEMPTS = 3
// Linear backoff: attempt N waits N * this before retrying.
const ASSET_RETRY_BACKOFF_MS = 300

const versionEl = document.getElementById('app-version')
if (versionEl) versionEl.textContent = `v${__APP_VERSION__}`

// Reflect saved prefs immediately (synchronous localStorage read) so the
// controls don't flash their default while the async startup runs.
primeToggle('bg-toggle', peekBgEnabled())
primeToggle('tally-toggle', peekTallyEnabled())
primeToggle('reset-startup-toggle', peekResetOnStartup())
primeSelect('mode-select', peekDiceMode() ? 'dice' : 'coin')

// Must run before the first updateImageRawData, or the coin never renders on
// SDK 0.0.12. See sdkPatch.ts.
patchImageCompressModeBug()

const bridge = await waitForEvenAppBridge()

// First paint first: the startup page create goes out immediately, before any
// asset or settings work. It rides the bridge queue, so everything enqueued
// below lines up behind it.
const pages = createPageManager(bridge)
const pageReady = pages.createInitial()

// Coin assets load lazily with a retry ladder and a blank-frame last resort: a
// single transient fetch/decode failure here used to abort the whole module
// before the page container and input handler existed — a dead black app.
// With the fallback, home / dice mode / settings / exit all still work; only
// the coin renders blank until a relaunch.
let coinAssetsPromise: Promise<CoinAssets> | null = null
function ensureCoinAssets(): Promise<CoinAssets> {
  if (!coinAssetsPromise) coinAssetsPromise = loadCoinAssetsWithRetry()
  return coinAssetsPromise
}
async function loadCoinAssetsWithRetry(): Promise<CoinAssets> {
  for (let attempt = 1; attempt <= MAX_ASSET_LOAD_ATTEMPTS; attempt++) {
    try {
      return await loadCoinAssets(COIN_W, bridge)
    } catch (err) {
      console.error(
        `Coin asset load failed (attempt ${attempt}/${MAX_ASSET_LOAD_ATTEMPTS}):`,
        err,
      )
      if (attempt < MAX_ASSET_LOAD_ATTEMPTS) {
        await new Promise(resolve =>
          setTimeout(resolve, ASSET_RETRY_BACKOFF_MS * attempt),
        )
      }
    }
  }
  const blank = makeBlankImage(COIN_W)
  return {
    heads: blank,
    headsHalf: blank,
    headsHalfRotated: blank,
    tailsHalfRotated: blank,
    tailsHalf: blank,
    tails: blank,
  }
}

// The banner plaque shown on the home screen. Memoized so the startup warm-up
// and every home-screen open share one load; a failed load clears the memo so
// the next open retries.
let bannerPromise: Promise<Uint8Array> | null = null
function ensureBanner(): Promise<Uint8Array> {
  if (!bannerPromise) {
    bannerPromise = loadBannerAsset(BANNER_W, BANNER_H, bridge)
    bannerPromise.catch(() => {
      bannerPromise = null
    })
  }
  return bannerPromise
}

// Warm both in the background; nothing on the home screen's first paint needs
// them except the banner, which home.open() awaits via sendBanner.
void ensureCoinAssets()
void ensureBanner()

const blankImage = makeBlankImage(COIN_W)
const preview = setupPreview()

// Settings and tallies, loaded together: each read hits localStorage first and
// falls back to the SDK store, and the SDK reads ride the serialized bridge
// queue anyway — loading in parallel just drops the JS-side serialization.
const [tally, bgEnabledLoaded, tallyEnabledLoaded, diceModeLoaded, diceStats, resetLoaded] =
  await Promise.all([
    loadTally(bridge),
    loadBgEnabled(bridge),
    loadTallyEnabled(bridge),
    loadDiceMode(bridge),
    loadDiceStats(bridge),
    loadResetOnStartup(bridge),
  ])

let currentPhase: DrizzlePhase = 'idle'
// Field velocity while currentPhase is 'motion' (rows per drizzle update).
let currentVelocity = 0
let rollField: RollFieldState | null = null
let drizzleSeed = Math.floor(Math.random() * 0xffffffff)
let bgEnabled = bgEnabledLoaded
let tallyEnabled = tallyEnabledLoaded
let diceMode = diceModeLoaded
let resetOnStartup = resetLoaded

if (resetOnStartup) {
  tally.heads = 0
  tally.tails = 0
  saveTally(bridge, tally)
  diceStats.rolls = 0
  diceStats.last = null
  saveDiceStats(bridge, diceStats)
}

// Die assets load lazily and stay warm for the session.
let dieAssetsPromise: Promise<DieAssets> | null = null
function ensureDieAssets(): Promise<DieAssets> {
  if (!dieAssetsPromise) dieAssetsPromise = loadDieAssets(COIN_W, bridge)
  return dieAssetsPromise
}

const idleStatus = () => (diceMode ? ROLL_IDLE_STATUS : IDLE_STATUS)

// Idle die face: the last rolled value, or the top face for a fresh start.
async function idleDieImage(): Promise<Uint8Array> {
  const dieAssets = await ensureDieAssets()
  return dieAssets.face(diceStats.last ?? DIE_FACES)
}

// The home screen owns the display at startup, so no initial coin/die paint
// happens here — home.open() blanks the canvas and draws its rows, and closing
// it restores the selected mode's view.

function sendDrizzleContent(content: string): Promise<unknown> {
  // The drizzle container only exists on the game page.
  if (pages.current() !== 'game') return Promise.resolve()
  preview?.updateDrizzle(content)
  return sendText(bridge, 'bgDrizzle', content)
}

// Skip a tick if the previous drizzle write hasn't landed yet, so a slow/stalled
// BLE link can never accumulate a backlog of frames that drains slowly.
let drizzleInFlight = false
function sendDrizzleFrame(force = false): void {
  // The settings menu and home screen draw their rows into this container —
  // a drizzle frame would stamp over them.
  if (menu.isOpen() || home.isOpen()) return
  // Periodic ticks skip while a write is in flight so a slow link can't build
  // a backlog. Phase-transition frames (force) are semantic and bounded per
  // animation — dropping one would strand the field in the previous phase
  // (e.g. frozen shapes on the landing frame instead of the ambient dots).
  if (!force && drizzleInFlight) return
  drizzleInFlight = true
  drizzleSeed = (drizzleSeed + 1) >>> 0
  void sendDrizzleContent(currentDrizzleContent()).finally(() => {
    drizzleInFlight = false
  })
}

function currentDrizzleContent(): string {
  if (currentPhase === 'motion') {
    // Defensive fallback: 'motion' always seeds a field in setDrizzlePhase, but
    // if it were ever missing, ambient dots beat crashing mid-animation.
    return rollField
      ? makeRollFieldFrame(rollField, currentVelocity)
      : makeDrizzleFrame('landed', drizzleSeed)
  }
  return makeDrizzleFrame(currentPhase, drizzleSeed)
}

// Shared by the flip and roll controllers (and the roll's post-landing decay
// timers, which can fire after the animation): records the phase and repaints,
// unless a full-canvas menu owns the drizzle container right now. Entering
// 'motion' seeds a fresh debris field; leaving it drops the field.
function setDrizzlePhase(phase: DrizzlePhase, velocity = 0): void {
  if (phase === 'motion' && currentPhase !== 'motion') {
    rollField = makeRollField(Math.floor(Math.random() * 0xffffffff))
  } else if (phase !== 'motion') {
    rollField = null
  }
  currentPhase = phase
  currentVelocity = velocity
  if (!bgEnabled) return
  if (menu.isOpen() || home.isOpen()) return
  sendDrizzleFrame(true)
}

function tallyParts(): [string, string] {
  return diceMode
    ? [formatRolls(diceStats), formatLast(diceStats)]
    : [formatHeads(tally), formatTails(tally)]
}

function tallyLine(): string {
  const [left, right] = tallyParts()
  return spreadText(left, right, TALLY_INNER_W - TALLY_RIGHT_MARGIN)
}

function sendTally(): void {
  const [left, right] = tallyParts()
  preview?.updateTally(tallyEnabled ? left : '', tallyEnabled ? right : '')
  // The tally bar overlays the top of the menu, so hold the glasses write while
  // the menu is up — toggling the tally from there would otherwise stamp the
  // counts across the title row. onClose repaints it with the final state.
  // (On the home screen the container doesn't even exist.)
  if (menu.isOpen() || home.isOpen()) return
  void sendText(bridge, 'tallyBar', tallyEnabled ? tallyLine() : TALLY_BLANK)
}

// Assigned after the menus exist; only ever invoked from input events and the
// controllers' onSettled hooks, both of which fire later still.
let router: InputRouter

const flip = createFlipController({
  bridge,
  getAssets: ensureCoinAssets,
  // One rain repaint immediately before every coin frame. The repeat write
  // within a phase is not redundant: it reseeds the glyph positions, so the rain
  // animates in lockstep with the tumble. Deduplicating it froze the rain
  // through the ascent and threw the timing off.
  setPhase: setDrizzlePhase,
  onResult(result) {
    if (result === 'heads') tally.heads += 1
    else tally.tails += 1
    sendTally()
  },
  onSettled() {
    saveTally(bridge, tally)
    router.openPendingMenu()
  },
  preview,
})

const roll = createRollController({
  bridge,
  getAssets: ensureDieAssets,
  setPhase: setDrizzlePhase,
  onResult(value) {
    diceStats.rolls += 1
    diceStats.last = value
    sendTally()
  },
  onSettled() {
    saveDiceStats(bridge, diceStats)
    router.openPendingMenu()
  },
  preview,
})

function sendStatus(content: string): void {
  preview?.updateStatus(content)
  void sendText(bridge, 'statusBar', content)
}

// Send the center image for the current mode: the coin's last frame, or the
// idle die face (which is also the last-rolled face, so a menu close restores
// what was showing).
async function sendMainImage(): Promise<void> {
  const img = diceMode
    ? await idleDieImage()
    : (await ensureCoinAssets())[flip.currentFrame()]
  preview?.updateCoin(img)
  void sendImage(bridge, 'coinImage', img)
}

// Set + persist the mode without touching the display — display handling
// depends on which surface (home, menu, phone) drove the change.
function applyMode(dice: boolean, fromPhone = false): void {
  diceMode = dice
  saveDiceMode(bridge, dice)
  if (!fromPhone) primeSelect('mode-select', dice ? 'dice' : 'coin')
  // Warm the die assets so the first roll doesn't pay the load.
  if (dice) void ensureDieAssets()
  flip.clearResult()
  roll.clearResult()
}

// Home-screen selection: even re-picking the current mode must land in that
// mode's view, so no change-detection here.
function chooseMode(dice: boolean): void {
  applyMode(dice)
  sendTally()
  home.close()
}

function setDiceMode(enabled: boolean, fromPhone = false): void {
  if (diceMode === enabled) return
  // A switch mid-animation would let the old mode's still-running loop paint
  // its result over the new mode's view and bump the old tally behind the new
  // display (the queue serializes in enqueue order, so the animation's frames
  // land last). Refuse and snap the phone control back to reality.
  if (flip.isBusy() || roll.isBusy()) {
    if (fromPhone) primeSelect('mode-select', diceMode ? 'dice' : 'coin')
    return
  }
  applyMode(enabled, fromPhone)
  sendTally()
  // A phone-side switch while the home screen is up jumps into that mode.
  if (home.isOpen()) {
    home.close()
  } else if (!menu.isOpen()) {
    void sendMainImage()
    sendStatus(idleStatus())
  }
  // The menu's "Reset current tally" row shows the active mode's counts.
  if (fromPhone) menu.refresh()
}

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
  // While the settings menu or home screen owns the canvas, only record the
  // state: their rows live in the drizzle container, so painting or blanking
  // it now would flash over them — and starting the ticker would wipe the menu
  // out entirely on its next tick. The menu's onClose (restoreMainView) calls
  // back in to apply the final state to the restored game view.
  if (menu.isOpen() || home.isOpen()) {
    stopDrizzleTicker()
    return
  }
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
  // A phone-driven change while the on-glasses settings menu is up must
  // repaint its value rows, or the user acts on a stale [ ON ]/[ OFF ] and
  // their next tap flips the setting back. (Glasses-driven changes re-render
  // via menu.select already.)
  if (fromPhone) menu.refresh()
}

function setTallyEnabled(enabled: boolean, fromPhone = false): void {
  tallyEnabled = enabled
  saveTallyEnabled(bridge, enabled)
  sendTally()
  if (!fromPhone) primeToggle('tally-toggle', enabled)
  if (fromPhone) menu.refresh()
}

function setResetOnStartup(enabled: boolean, fromPhone = false): void {
  resetOnStartup = enabled
  saveResetOnStartup(bridge, enabled)
  if (!fromPhone) primeToggle('reset-startup-toggle', enabled)
  if (fromPhone) menu.refresh()
}

// No applyBgEnabled here: startup lands on the home screen, and every entry
// into the game view goes through restoreMainView, which applies the state.
// (It would also run before the menu controllers below exist.)
setupToggle('bg-toggle', bgEnabled, enabled => setBgEnabled(enabled, true))

setupToggle('tally-toggle', tallyEnabled, enabled =>
  setTallyEnabled(enabled, true),
)

setupToggle('reset-startup-toggle', resetOnStartup, enabled =>
  setResetOnStartup(enabled, true),
)

setupSelect('mode-select', diceMode ? 'dice' : 'coin', value =>
  setDiceMode(value === 'dice', true),
)

// Resets the stats for whichever mode is active — that's what's on screen.
function resetTally(): void {
  if (diceMode) {
    diceStats.rolls = 0
    diceStats.last = null
    saveDiceStats(bridge, diceStats)
  } else {
    tally.heads = 0
    tally.tails = 0
    saveTally(bridge, tally)
  }
  sendTally()
}

const tallyResetBtn = document.getElementById(
  'tally-reset',
) as HTMLButtonElement | null
if (tallyResetBtn) {
  tallyResetBtn.addEventListener('click', () => {
    resetTally()
    // The menu's "Reset current tally" row echoes the counts.
    menu.refresh()
  })
  tallyResetBtn.disabled = false
}

// Settings menu takeover: it draws its rows into the game page's full-canvas
// drizzle container, so everything else on that page is blanked around it.
function menuTakeover(): void {
  // Stop the drizzle ticker so it can't overwrite the rows, and drop any
  // result state we're painting over.
  stopDrizzleTicker()
  flip.clearResult()
  roll.clearResult()
  // No drizzle blank here: the menu's own render() repaints that whole
  // container immediately after this returns, so a blank first would just
  // spend an extra BLE round trip on content that is never seen.
  preview?.updateCoin(blankImage)
  void sendImage(bridge, 'coinImage', blankImage)
  sendStatus(' ')
  void sendText(bridge, 'tallyBar', TALLY_BLANK)
  preview?.updateTally('', '')
}

// Home screen takeover: swap to the home page layout (banner + option rows —
// no coin/status/tally containers at all).
function homeTakeover(): void {
  stopDrizzleTicker()
  flip.clearResult()
  roll.clearResult()
  pages.switchTo('home')
  preview?.updateDrizzle('')
  preview?.updateStatus('')
  preview?.updateTally('', '')
  preview?.updateCoin(blankImage)
}

async function sendBanner(): Promise<void> {
  let banner: Uint8Array
  try {
    banner = await ensureBanner()
  } catch (err) {
    console.error('Banner load failed:', err)
    return
  }
  preview?.updateBanner(banner)
  await sendImage(bridge, 'banner', banner)
}

function restoreMainView(): void {
  // Coming from the home screen this swaps the page layout (dropping the
  // banner and option rows); coming from the settings menu it's a no-op swap
  // and the writes below repaint in place.
  pages.switchTo('game')
  preview?.updateBanner(null)
  preview?.updateHome('')
  void sendMainImage()
  sendStatus(idleStatus())
  sendTally()
  // applyBgEnabled repaints the drizzle (or blanks it) and restarts the ticker,
  // clearing the menu rows out of the full-canvas container either way.
  applyBgEnabled(bgEnabled)
}

const menu = createMenuController({
  bridge,
  preview,
  title: '        S E T T I N G S',
  items: [
    {
      label: 'Home',
      onSelect: () => {
        // Hand the canvas straight to the home screen — no restore in between.
        menu.closeSilently()
        home.open()
      },
    },
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
      getValue: () =>
        diceMode
          ? `${diceStats.rolls} ${diceStats.rolls === 1 ? 'roll' : 'rolls'}`
          : `${tally.heads} / ${tally.tails}`,
      onSelect: resetTally,
    },
    // exitMode 1 — hand off to the ER exit prompt. exitMode 0 claims to quit
    // immediately but leaves the app not fully closed, so the prompt is the
    // reliable teardown path.
    { label: 'Exit', onSelect: () => void bridge.shutDownPageContainer(1) },
  ],
  onOpen: menuTakeover,
  onClose: restoreMainView,
})

// Home screen: banner plaque on top, mode picker centered below — shown at
// startup and reachable from the settings menu. Future game modes slot in as
// new rows. The rows wait for the banner image (prepare) before rendering.
const home = createMenuController({
  bridge,
  preview,
  title: '',
  centerWidth: HOME_MENU_INNER_W,
  target: 'homeMenu',
  mirror: content => preview?.updateHome(content),
  items: [
    { label: 'Coin Flip', onSelect: () => chooseMode(false) },
    { label: 'Dice Roll', onSelect: () => chooseMode(true) },
    { label: 'Exit', onSelect: () => void bridge.shutDownPageContainer(1) },
  ],
  onOpen: homeTakeover,
  onClose: restoreMainView,
  prepare: sendBanner,
})

// Dev card: replay the roll animation. Forces dice mode if needed and plays a
// real roll on the glasses (mirrored on the phone).
function devRoll(): void {
  if (roll.isBusy() || flip.isBusy()) return
  if (menu.isOpen()) menu.closeSilently()
  if (home.isOpen()) home.closeSilently()
  if (!diceMode) applyMode(true)
  restoreMainView()
  roll.trigger()
}

document.getElementById('dev-roll-play')?.addEventListener('click', devRoll)

// Pause background animation while the app is hidden/locked. Otherwise the
// drizzle ticker keeps queuing BLE writes that can't complete (timers throttle,
// BLE stalls), piling up a backlog that drains slowly on resume and makes the
// app feel sluggish.
function pauseActivity(): void {
  stopDrizzleTicker()
}

function resumeActivity(): void {
  // Not while the settings menu or home screen is up — the ticker writes to
  // the same full-canvas container their rows live in.
  if (menu.isOpen() || home.isOpen()) return
  startDrizzleTicker()
}

// Device lock / app switch does not always fire the SDK foreground events, but
// it does flip document visibility — cover that path too.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseActivity()
  else resumeActivity()
})

let unsubscribe: () => void

router = createInputRouter({
  home,
  menu,
  getSurface: () => (diceMode ? roll : flip),
  exitApp: () => void bridge.shutDownPageContainer(1),
  onForegroundEnter: resumeActivity,
  onForegroundExit: pauseActivity,
  onAppExit() {
    stopDrizzleTicker()
    unsubscribe()
  },
})

unsubscribe = bridge.onEvenHubEvent(event => router.handleEvent(event))

// The startup create must have settled before the home screen's banner write
// goes out (it rides the same queue, but a failed create means recovery
// rebuilds run first).
await pageReady

// Land on the home screen — the user picks coin flip or dice roll from there.
home.open()
