import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { kvGet, kvSet } from './kv'

// Bump whenever renderProcessed's output format or the source PNGs change, so
// stale processed copies in the kv cache are abandoned instead of served.
const CACHE_VERSION = 'v5'
// String.fromCharCode(...chunk) passes the chunk as individual arguments; one
// call over a whole image (banner, coin frames) exceeds the engine's argument
// limit and throws, so encode in slices safely under it.
const BASE64_CHUNK = 0x8000

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    const chunk = bytes.subarray(i, i + BASE64_CHUNK)
    bin += String.fromCharCode(...chunk)
  }
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function cacheKey(label: string, size: number): string {
  return `coin:${CACHE_VERSION}:${label}:${size}`
}

export async function loadCached(
  bridge: EvenAppBridge,
  label: string,
  size: number,
): Promise<Uint8Array | null> {
  const stored = await kvGet(bridge, cacheKey(label, size))
  if (!stored) return null
  try {
    const bytes = base64ToBytes(stored)
    if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) {
      return null
    }
    return bytes
  } catch {
    return null
  }
}

export function saveCached(
  bridge: EvenAppBridge,
  label: string,
  size: number,
  bytes: Uint8Array,
): void {
  kvSet(bridge, cacheKey(label, size), bytesToBase64(bytes))
}
