import { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { sendText, type ContainerKey } from './send'
import { centerText, spreadText } from './text'
import type { Preview } from './preview'

// The menu block is inset from the canvas edges so the cursor column and the
// right-hand values both sit clear of the display bezel.
const MENU_INDENT = '   '
// Width the label/value pairs spread across. Not derived from CANVAS_W (576):
// tuned on-device so the right-hand values sit clear of the bezel with the
// indent applied — retune if MENU_INDENT or the canvas geometry changes.
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
  /** Row is skipped by render and navigation while this returns true. */
  hidden?: () => boolean
  onSelect(): void
}

export interface MenuController {
  isOpen(): boolean
  open(): void
  close(): void
  /** Close without running onClose — for handing the canvas straight to
   *  another full-screen menu instead of restoring the main view. */
  closeSilently(): void
  moveUp(): void
  moveDown(): void
  select(): void
  /** Re-render the rows if open — for state changed by another surface
   *  (a phone toggle) while this menu is displaying values. No-op if closed. */
  refresh(): void
}

interface Deps {
  bridge: EvenAppBridge
  /** Heading row; pass '' for a menu headed by an image instead (home). */
  title: string
  /** Center rows (no values) within this pixel width instead of the
   *  left-aligned settings layout. */
  centerWidth?: number
  /** Text container the rows render into (defaults to the full-canvas one). */
  target?: ContainerKey
  /** Phone-mirror sink for the rendered rows (defaults to the drizzle pre). */
  mirror?(content: string): void
  items: MenuItem[]
  preview?: Preview | null
  /** Runs when the menu takes over the display (pause animation, clear the
   *  rest of the canvas or rebuild the page for this view). */
  onOpen(): void
  /** Runs after the menu is torn down (restore coin, status, tally, drizzle). */
  onClose(): void
  /**
   * Awaited before the rows first render on open — the home screen paints its
   * banner image here so the options never appear before the image.
   */
  prepare?(): Promise<void>
}

export function createMenuController({
  bridge,
  title,
  centerWidth,
  target = 'bgDrizzle',
  mirror,
  items,
  preview,
  onOpen,
  onClose,
  prepare,
}: Deps): MenuController {
  let open = false
  let selected = 0

  const visibleItems = () => items.filter(item => !item.hidden?.())

  function renderRow(item: MenuItem, isSelected: boolean): string {
    const left = (isSelected ? CURSOR : NO_CURSOR) + item.label
    if (centerWidth) return centerText(left, centerWidth)
    if (!item.getValue) return MENU_INDENT + left
    const raw = item.getValue()
    const value =
      typeof raw === 'string' ? raw : raw ? '[ ON ]' : '[ OFF ]'
    return MENU_INDENT + spreadText(left, value, MENU_INNER_W)
  }

  function render(): void {
    const visible = visibleItems()
    // Rows can disappear while the menu is up (a phone toggle hiding one);
    // keep the cursor in range.
    if (selected >= visible.length) selected = visible.length - 1
    const head = title ? ['', title, ''] : []
    const content = [
      ...head,
      ...visible.map((item, i) => renderRow(item, i === selected)),
    ].join('\n')

    if (mirror) mirror(content)
    else preview?.updateDrizzle(content)
    void sendText(bridge, target, content)
  }

  return {
    isOpen() {
      return open
    },

    open() {
      if (open) return
      open = true
      selected = 0
      // onOpen owns clearing the rest of the display (coin, status, tally, or
      // a whole page rebuild) — what needs clearing depends on the view.
      onOpen()

      if (prepare) {
        // Rows wait for the banner image; bail if the menu closed meanwhile.
        void prepare().then(() => {
          if (open) render()
        })
      } else {
        render()
      }
    },

    close() {
      if (!open) return
      open = false
      onClose()
    },

    closeSilently() {
      open = false
    },

    moveUp() {
      if (!open) return
      const count = visibleItems().length
      selected = (selected - 1 + count) % count
      render()
    },

    moveDown() {
      if (!open) return
      selected = (selected + 1) % visibleItems().length
      render()
    },

    select() {
      if (!open) return
      const item = visibleItems()[selected]
      if (!item) return
      item.onSelect()
      // Toggle and reset rows stay put so their new state is visible; Exit tears
      // the menu down from inside onSelect, so re-rendering then would be a no-op.
      if (open) render()
    },

    refresh() {
      if (!open) return
      render()
    },
  }
}
