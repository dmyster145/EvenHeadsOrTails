// The one place that knows what a container write looks like. Every text and
// image update goes through these, so the SDK payload shape (and the serial
// enqueue that all BLE calls must ride) lives in exactly one spot.

import {
  EvenAppBridge,
  ImageRawDataUpdate,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk'
import { IDS, NAMES } from './layout'
import { enqueue } from './bridgeQueue'

// IDS and NAMES share keys, so a single key names a container everywhere.
export type ContainerKey = keyof typeof IDS

export function sendText(
  bridge: EvenAppBridge,
  key: ContainerKey,
  content: string,
): Promise<boolean> {
  return enqueue(() =>
    bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: IDS[key],
        containerName: NAMES[key],
        content,
        // 0/0 — full content replacement, the only update mode the app uses.
        contentOffset: 0,
        contentLength: 0,
      }),
    ),
  )
}

export function sendImage(
  bridge: EvenAppBridge,
  key: ContainerKey,
  imageData: Uint8Array,
): Promise<string> {
  return enqueue(() =>
    bridge.updateImageRawData(
      new ImageRawDataUpdate({
        containerID: IDS[key],
        containerName: NAMES[key],
        imageData,
      }),
    ),
  )
}
