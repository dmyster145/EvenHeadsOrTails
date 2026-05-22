import {
  TextContainerProperty,
  ImageContainerProperty,
} from '@evenrealities/even_hub_sdk'

export const CANVAS_W = 576
export const CANVAS_H = 288

export const COIN_W = 144
export const COIN_H = 144
export const COIN_X = Math.round((CANVAS_W - COIN_W) / 2)
// Vertically centered in the canvas — the status is now a fixed line pinned to
// the bottom, so there's no toss peak to clear.
export const COIN_Y = Math.round((CANVAS_H - COIN_H) / 2)

export const PAD = 4
export const LINE_H = 27

// Tally row at the very top; status row at the very bottom.
export const TALLY_H = 36
export const TALLY_Y = 0
// Status is a single line pinned to the bottom; its text swaps in place with no
// vertical animation, so the firmware renders each change in one clean pass.
export const STATUS_H = LINE_H + 2 * PAD
export const STATUS_Y = CANVAS_H - STATUS_H
export const TALLY_INNER_W = CANVAS_W - 2 * PAD

export const IDS = {
  bgDrizzle: 1,
  statusBar: 2,
  coinImage: 3,
  tallyBar: 4,
} as const

export const NAMES = {
  bgDrizzle: 'bgDrizzle',
  statusBar: 'statusBar',
  coinImage: 'coinImage',
  tallyBar: 'tallyBar',
} as const

export const makeBgDrizzle = (content: string): TextContainerProperty =>
  new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: CANVAS_W,
    height: CANVAS_H,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 4,
    containerID: IDS.bgDrizzle,
    containerName: NAMES.bgDrizzle,
    content,
    isEventCapture: 1,
  })

export const makeStatusBar = (content: string): TextContainerProperty =>
  new TextContainerProperty({
    xPosition: 0,
    yPosition: STATUS_Y,
    width: CANVAS_W,
    height: STATUS_H,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: PAD,
    containerID: IDS.statusBar,
    containerName: NAMES.statusBar,
    content,
    isEventCapture: 0,
  })

export const makeTallyBar = (content: string): TextContainerProperty =>
  new TextContainerProperty({
    xPosition: 0,
    yPosition: TALLY_Y,
    width: CANVAS_W,
    height: TALLY_H,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: PAD,
    containerID: IDS.tallyBar,
    containerName: NAMES.tallyBar,
    content,
    isEventCapture: 0,
  })

export const makeCoinImage = (): ImageContainerProperty =>
  new ImageContainerProperty({
    xPosition: COIN_X,
    yPosition: COIN_Y,
    width: COIN_W,
    height: COIN_H,
    containerID: IDS.coinImage,
    containerName: NAMES.coinImage,
  })
