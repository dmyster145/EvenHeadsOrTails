// Page layouts and the container lifecycle: the one-shot startup create (with
// its WebView-reload recovery) and the home/game page swap with retry.

import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import {
  makeBgDrizzle,
  makeInputCapture,
  makeStatusBar,
  makeTallyBar,
  makeCoinImage,
  makeBanner,
  makeHomeMenu,
} from './layout'
import { makeInitialDrizzleFrame } from './drizzle'
import { enqueue } from './bridgeQueue'

// Two page layouts, swapped with rebuildPageContainer on view transitions.
// The home page deliberately has NO coin container and the game page NO
// banner/home containers: image containers erase whatever sits under their
// rect even when blanked transparent, so unused ones can't just be hidden.
export type PageKind = 'home' | 'game'

// containerTotalNum must equal the combined container count or the SDK
// rejects the page — derive it so the two can never drift.
const makePage = (
  textObject: ReturnType<typeof makeInputCapture>[],
  imageObject: ReturnType<typeof makeCoinImage>[],
) => ({
  containerTotalNum: textObject.length + imageObject.length,
  textObject,
  imageObject,
})

const homePage = () =>
  makePage([makeInputCapture(), makeHomeMenu()], [makeBanner()])

const gamePage = () =>
  makePage(
    [
      makeInputCapture(),
      makeBgDrizzle(makeInitialDrizzleFrame()),
      makeStatusBar(' '),
      makeTallyBar(' '),
    ],
    [makeCoinImage()],
  )

export interface PageManager {
  current(): PageKind
  switchTo(kind: PageKind): void
  /** The startup create plus its recovery path; call exactly once, and before
   *  any other container write is enqueued. */
  createInitial(): Promise<void>
}

export function createPageManager(bridge: EvenAppBridge): PageManager {
  let currentPageKind: PageKind = 'home'

  // A rejected rebuild means the glasses may still show the old layout (the G2
  // appendix treats it as a possibly-wedged session), so the result can't just
  // be discarded: retry once, and if that also fails, revert currentPageKind so
  // the write guards match what is actually displayed and the next navigation
  // re-attempts the swap instead of no-opping.
  function sendPageRebuild(
    kind: PageKind,
    previous: PageKind,
    retry: boolean,
  ): Promise<void> {
    const onFailure = (err?: unknown): void => {
      console.error(`rebuildPageContainer(${kind}) failed`, err ?? '')
      if (retry) {
        void sendPageRebuild(kind, previous, false)
        return
      }
      if (currentPageKind === kind) currentPageKind = previous
    }
    return enqueue(() =>
      bridge.rebuildPageContainer(
        new RebuildPageContainer(kind === 'home' ? homePage() : gamePage()),
      ),
    ).then(ok => {
      if (ok !== true) onFailure()
    }, onFailure)
  }

  return {
    current() {
      return currentPageKind
    },

    switchTo(kind) {
      if (currentPageKind === kind) return
      const previous = currentPageKind
      currentPageKind = kind
      void sendPageRebuild(kind, previous, true)
    },

    async createInitial() {
      // Enqueued like every other bridge call: later writes (banner, kv reads)
      // ride the same queue, so nothing can hit the BLE link while the create
      // is still in flight.
      const createResult = await enqueue(() =>
        bridge.createStartUpPageContainer(
          new CreateStartUpPageContainer(homePage()),
        ),
      )
      if (createResult === 0) return

      // createStartUpPageContainer is one-shot per session: a WebView reload's
      // second create returns 1 and the glasses keep rendering the cached
      // frame, fully unresponsive. rebuildPageContainer is the documented
      // recovery. It must be called directly — switchTo no-ops when the page
      // kind already matches, which it does here.
      console.error(
        'createStartUpPageContainer failed, rebuilding:',
        createResult,
      )
      try {
        const ok = await enqueue(() =>
          bridge.rebuildPageContainer(new RebuildPageContainer(homePage())),
        )
        if (ok !== true) console.error('Recovery rebuildPageContainer rejected')
      } catch (err) {
        console.error('Recovery rebuildPageContainer failed:', err)
      }
    },
  }
}
