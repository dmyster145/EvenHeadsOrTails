// Raw SDK events to app actions: gesture classification, the double-tap
// debounce, and routing to whichever surface (home, settings menu, active
// game mode) owns the display.

import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
import type { MenuController } from './menu'
import { activateKeepAlive, isKeepAliveActive } from './keepAlive'

// Gesture classification leans on SDK 0.0.12 event-shape conventions that its
// types don't state:
// - A sysEvent PRESENT with a null/undefined eventType is a single tap.
// - Named gestures arrive typed: sysEvent.eventType carries DOUBLE_CLICK_EVENT
//   (and the lifecycle events), textEvent.eventType carries SCROLL_TOP /
//   SCROLL_BOTTOM for swipe up / swipe down.
interface Gesture {
  isSingleClick: boolean
  isDoubleClick: boolean
  isSwipeUp: boolean
  isSwipeDown: boolean
}

function classifyGesture(event: EvenHubEvent): Gesture {
  const hasSys = event.sysEvent !== undefined
  const sysType = event.sysEvent?.eventType ?? null
  const textType = event.textEvent?.eventType ?? null
  return {
    isSingleClick: hasSys && sysType === null,
    isDoubleClick: sysType === OsEventTypeList.DOUBLE_CLICK_EVENT,
    isSwipeUp: textType === OsEventTypeList.SCROLL_TOP_EVENT,
    isSwipeDown: textType === OsEventTypeList.SCROLL_BOTTOM_EVENT,
  }
}

// The SDK fires DOUBLE_CLICK_EVENT twice (~110ms apart) per physical
// double-tap. Without a debounce the pair cancels itself: the first event
// opens the settings menu and the second immediately closes it (and from the
// home screen, the exit prompt fires twice). Debounce is per event TYPE —
// single taps and swipes must pass untouched.
const DOUBLE_CLICK_DEBOUNCE_MS = 250

/** The subset of the flip/roll controllers the router drives. */
export interface GameSurface {
  isBusy(): boolean
  isResultShowing(): boolean
  trigger(): void
  dismissResult(): Promise<void>
}

interface Deps {
  home: MenuController
  menu: MenuController
  /** The active mode's controller (flip or roll). */
  getSurface(): GameSurface
  /** Hand off to the ER exit prompt. */
  exitApp(): void
  onForegroundEnter(): void
  onForegroundExit(): void
  /** Session teardown on SYSTEM_EXIT / ABNORMAL_EXIT (stop timers, drop the
   *  event subscription). */
  onAppExit(): void
}

export interface InputRouter {
  handleEvent(event: EvenHubEvent): void
  /** Honor a double-tap that arrived mid-animation; call when the animation
   *  settles. */
  openPendingMenu(): void
}

export function createInputRouter({
  home,
  menu,
  getSurface,
  exitApp,
  onForegroundEnter,
  onForegroundExit,
  onAppExit,
}: Deps): InputRouter {
  let lastDoubleClickAt = 0

  // A double-tap that arrives mid-animation can't open the menu (the animation
  // owns the display and has no cancel path), but silently eating it left the
  // settings menu — and the exit inside it — unreachable during the tumble.
  // Remember the intent and honor it when the animation settles instead. Any
  // other deliberate gesture in between clears it.
  let pendingMenuOpen = false

  function handleEvent(event: EvenHubEvent): void {
    const sysType = event.sysEvent?.eventType ?? null

    if (sysType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
      onForegroundEnter()
      return
    }
    if (sysType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
      onForegroundExit()
      return
    }
    if (
      sysType === OsEventTypeList.SYSTEM_EXIT_EVENT ||
      sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT
    ) {
      onAppExit()
      return
    }

    const { isSingleClick, isDoubleClick, isSwipeUp, isSwipeDown } =
      classifyGesture(event)

    // First user gesture activates the WebView keep-alive. Must run from a
    // gesture context (autoplay policy), so it lives here on the input path.
    if (
      (isSingleClick || isDoubleClick || isSwipeUp || isSwipeDown) &&
      !isKeepAliveActive()
    ) {
      activateKeepAlive()
    }

    const surface = getSurface()

    // Double-tap is the back gesture: from the home screen it hands off to the
    // ER exit prompt (the required exit path), from a mode view it opens the
    // settings menu, and from the menu it closes it. Handled inline and ahead
    // of everything else so the gesture is never swallowed. Cleanup runs in
    // the SYSTEM_EXIT / ABNORMAL_EXIT handlers above, not here.
    if (isDoubleClick) {
      const now = Date.now()
      if (now - lastDoubleClickAt < DOUBLE_CLICK_DEBOUNCE_MS) return
      lastDoubleClickAt = now
      if (home.isOpen()) exitApp()
      else if (menu.isOpen()) menu.close()
      else if (!surface.isBusy()) menu.open()
      // Mid-animation: honor the intent once the animation settles.
      else pendingMenuOpen = true
      return
    }

    // Any other deliberate gesture supersedes a deferred menu-open.
    if (pendingMenuOpen && (isSingleClick || isSwipeUp || isSwipeDown)) {
      pendingMenuOpen = false
    }

    if (home.isOpen()) {
      if (isSwipeUp) home.moveUp()
      else if (isSwipeDown) home.moveDown()
      else if (isSingleClick) home.select()
      return
    }

    if (menu.isOpen()) {
      if (isSwipeUp) menu.moveUp()
      else if (isSwipeDown) menu.moveDown()
      else if (isSingleClick) menu.select()
      return
    }

    if (surface.isResultShowing()) {
      if (isSwipeUp) {
        surface.trigger()
      } else if (isSingleClick || isSwipeDown) {
        void surface.dismissResult()
      }
      return
    }

    if (isSwipeUp) {
      surface.trigger()
    }
  }

  return {
    handleEvent,
    openPendingMenu() {
      if (!pendingMenuOpen) return
      pendingMenuOpen = false
      if (!menu.isOpen() && !home.isOpen()) menu.open()
    },
  }
}
