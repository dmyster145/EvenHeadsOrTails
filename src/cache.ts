import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

const CACHE_VERSION = 'v2'
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
  try {
    const stored = await bridge.getLocalStorage(cacheKey(label, size))
    if (!stored) return null
    const bytes = base64ToBytes(stored)
    if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) {
      return null
    }
    return bytes
  } catch {
    return null
  }
}

export async function saveCached(
  bridge: EvenAppBridge,
  label: string,
  size: number,
  bytes: Uint8Array,
): Promise<void> {
  try {
    await bridge.setLocalStorage(cacheKey(label, size), bytesToBase64(bytes))
  } catch {
    // Cache write failures are non-fatal.
  }
}
