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

  // A kvSet for this key may have landed while the SDK read was in flight.
  // localStorage is authoritative, so the newer local value wins — without
  // this re-check the back-fill below would clobber it with the stale SDK
  // copy AND return the stale value to the caller. (No await between this
  // re-check and the back-fill write, so nothing can interleave.)
  try {
    const local = window.localStorage.getItem(key)
    if (local) return local
  } catch {
    // localStorage unavailable; fall through.
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
  // One retry, then a loud log. A lost SDK copy is what lets a later
  // localStorage eviction resurrect stale data (the accepted tradeoff of the
  // dual-store design — see the header comment); a write the SDK ACKs but
  // silently drops is not detectable in software, but a rejected write is,
  // so it should never vanish without a trace.
  const write = () => enqueue(() => bridge.setLocalStorage(key, value))
  void write().catch(() =>
    write().catch(err =>
      console.error(`SDK store write failed for "${key}":`, err),
    ),
  )
}
