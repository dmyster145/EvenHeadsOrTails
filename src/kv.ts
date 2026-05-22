import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { enqueue } from './bridgeQueue'

// Dual-store key-value persistence.
//
// localStorage is authoritative: it survives iOS WKWebView app restarts, where
// the SDK host store has been observed to silently drop writes. The SDK store is
// written best-effort (serialized through the bridge queue) so Android — where the
// SDK store is the durable one — also persists. Reads prefer localStorage and fall
// back to the SDK store, back-filling localStorage so the durable copy migrates.

export async function kvGet(bridge: EvenAppBridge, key: string): Promise<string> {
  try {
    const local = window.localStorage.getItem(key)
    if (local) return local
  } catch {
    // localStorage unavailable; fall through to the SDK store.
  }

  let sdk = ''
  try {
    sdk = (await enqueue(() => bridge.getLocalStorage(key))) ?? ''
  } catch {
    return ''
  }

  if (sdk) {
    try {
      window.localStorage.setItem(key, sdk)
    } catch {
      // Back-fill is best-effort.
    }
  }
  return sdk
}

export function kvSet(bridge: EvenAppBridge, key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // localStorage write failed (quota?); the SDK write below still runs.
  }
  void enqueue(() => bridge.setLocalStorage(key, value))
}
