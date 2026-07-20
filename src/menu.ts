import {
  EvenAppBridge,
  ImageRawDataUpdate,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk'
import { IDS, NAMES } from './layout'
import { enqueue } from './bridgeQueue'
import { spreadText } from './text'
import type { Preview } from './preview'

// The status bar is blanked while the menu is up — the menu rows are the whole UI.
const STATUS_BLANK = ' '
const MENU_TITLE = '        S E T T I N G S'

// The menu block is inset from the canvas edges so the cursor column and the
// right-hand values both sit clear of the display bezel.
const MENU_INDENT = '   '
const MENU_INNER_W = 420

// '>' rather than a nicer '▸' — the glasses font has no glyph for the latter and
// renders it as blank, leaving the selected row unmarked.
const CURSOR = '> '
const NO_CURSOR = '  '

export interface MenuItem {
  label: string
  /**
   * Right-hand value for the row. A boolean renders as [ ON ] / [ OFF ]; a
   * string renders as-is. Action rows that show nothing (Exit) omit this.
   */
  getValue?: () => boolean | string
  onSelect(): void
}

export interface MenuController {
  isOpen(): boolean
  open(): void
  close(): void
  moveUp(): void
  moveDown(): void
  select(): void
}

interface Deps {
  bridge: EvenAppBridge
  items: MenuItem[]
  preview?: Preview | null
  blankImage: Uint8Array
  /** Runs when the menu takes over the display (pause animation, blank tally). */
  onOpen(): void
  /** Runs after the menu is torn down (restore coin, status, tally, drizzle). */
  onClose(): void
}

export function createMenuController({
  bridge,
  items,
  preview,
  blankImage,
  onOpen,
  onClose,
}: Deps): MenuController {
  let open = false
  let selected = 0

  function renderRow(item: MenuItem, isSelected: boolean): string {
    const left = (isSelected ? CURSOR : NO_CURSOR) + item.label
    if (!item.getValue) return MENU_INDENT + left
    const raw = item.getValue()
    const value =
      typeof raw === 'string' ? raw : raw ? '[ ON ]' : '[ OFF ]'
    return MENU_INDENT + spreadText(left, value, MENU_INNER_W)
  }

  function render(): void {
    const content = [
      '',
      MENU_TITLE,
      '',
      ...items.map((item, i) => renderRow(item, i === selected)),
    ].join('\n')

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

  return {
    isOpen() {
      return open
    },

    open() {
      if (open) return
      open = true
      selected = 0
      onOpen()

      // Clear the coin and the status line so the menu owns the whole canvas.
      preview?.updateCoin(blankImage)
      void enqueue(() =>
        bridge.updateImageRawData(
          new ImageRawDataUpdate({
            containerID: IDS.coinImage,
            containerName: NAMES.coinImage,
            imageData: blankImage,
          }),
        ),
      )
      preview?.updateStatus(STATUS_BLANK)
      void enqueue(() =>
        bridge.textContainerUpgrade(
          new TextContainerUpgrade({
            containerID: IDS.statusBar,
            containerName: NAMES.statusBar,
            content: STATUS_BLANK,
            contentOffset: 0,
            contentLength: 0,
          }),
        ),
      )
      render()
    },

    close() {
      if (!open) return
      open = false
      onClose()
    },

    moveUp() {
      if (!open) return
      selected = (selected - 1 + items.length) % items.length
      render()
    },

    moveDown() {
      if (!open) return
      selected = (selected + 1) % items.length
      render()
    },

    select() {
      if (!open) return
      const item = items[selected]
      item.onSelect()
      // Toggle and reset rows stay put so their new state is visible; Exit tears
      // the menu down from inside onSelect, so re-rendering then would be a no-op.
      if (open) render()
    },
  }
}
