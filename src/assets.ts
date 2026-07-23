import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import UPNG from 'upng-js'
import { loadCached, saveCached } from './cache'

export type CoinFrame =
  | 'heads'
  | 'headsHalf'
  | 'headsHalfRotated'
  | 'tailsHalfRotated'
  | 'tailsHalf'
  | 'tails'

const PATHS: Record<CoinFrame, string> = {
  heads: '/coin/heads.png',
  headsHalf: '/coin/heads-half.png',
  headsHalfRotated: '/coin/heads-half_rotated.png',
  tailsHalfRotated: '/coin/tails-half_rotated.png',
  tailsHalf: '/coin/tails-half.png',
  tails: '/coin/tails.png',
}

export type CoinAssets = Record<CoinFrame, Uint8Array>

// Display-pass tuning, eyeballed against the G2 panel: alpha below the
// threshold drops to fully transparent (soft edges render as noise on the
// glasses), the contrast boost keeps midtone art legible in ambient light, and
// 16 palette levels match the panel's 4-bit depth while keeping the PNG
// payload small for the BLE transfer.
const ALPHA_THRESHOLD = 180
const CONTRAST_FACTOR = 1.6
const PALETTE_SIZE = 16

export async function decodePng(bytes: Uint8Array): Promise<HTMLImageElement> {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: 'image/png',
  })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Draws the source resized to width×height and runs the glasses display pass:
// hard alpha threshold, grayscale with contrast boost, 16-level palette PNG.
export function renderProcessed(
  src: CanvasImageSource,
  width: number,
  height = width,
): Uint8Array {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to acquire 2D canvas context')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, width, height)

  const imageData = ctx.getImageData(0, 0, width, height)
  const px = imageData.data
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < ALPHA_THRESHOLD) {
      px[i] = 0
      px[i + 1] = 0
      px[i + 2] = 0
      px[i + 3] = 0
    } else {
      const lum = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114
      const boosted = Math.max(
        0,
        Math.min(255, (lum - 128) * CONTRAST_FACTOR + 128),
      )
      px[i] = boosted
      px[i + 1] = boosted
      px[i + 2] = boosted
      px[i + 3] = 255
    }
  }

  const rgba = new ArrayBuffer(px.byteLength)
  new Uint8ClampedArray(rgba).set(px)
  const encoded = UPNG.encode([rgba], width, height, PALETTE_SIZE)
  return new Uint8Array(encoded)
}

async function resizePng(bytes: Uint8Array, size: number): Promise<Uint8Array> {
  return renderProcessed(await decodePng(bytes), size)
}

export async function fetchPng(path: string): Promise<Uint8Array> {
  const res = await fetch(path)
  if (!res.ok) {
    throw new Error(`Failed to load asset ${path}: ${res.status}`)
  }
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) {
    throw new Error(
      `Asset ${path} does not look like a PNG (got ${bytes.length} bytes, first=${bytes[0]?.toString(16)} ${bytes[1]?.toString(16)})`,
    )
  }
  return bytes
}

// Fully transparent frame, used to clear an image container (coin while a
// menu is up, banner outside the home screen) — the image layer draws over the
// full-canvas text container, so it has to be blanked or it sits on top of
// the menu rows.
export function makeBlankImage(width: number, height = width): Uint8Array {
  const rgba = new ArrayBuffer(width * height * 4)
  return new Uint8Array(UPNG.encode([rgba], width, height, PALETTE_SIZE))
}

// The home-screen banner plaque, processed to its on-canvas size — a single
// image container now that the plaque fits the firmware's 288px width cap.
const BANNER_PATH = '/banner.png'
const BANNER_CACHE_LABEL = 'banner:v2'

export async function loadBannerAsset(
  width: number,
  height: number,
  bridge?: EvenAppBridge,
): Promise<Uint8Array> {
  if (bridge) {
    const cached = await loadCached(bridge, BANNER_CACHE_LABEL, width)
    if (cached) return cached
  }
  const bytes = await fetchPng(BANNER_PATH)
  const full = renderProcessed(await decodePng(bytes), width, height)
  if (bridge) saveCached(bridge, BANNER_CACHE_LABEL, width, full)
  return full
}

export async function loadCoinAssets(
  size: number,
  bridge?: EvenAppBridge,
): Promise<CoinAssets> {
  const entries = await Promise.all(
    (Object.keys(PATHS) as CoinFrame[]).map(async key => {
      if (bridge) {
        const cached = await loadCached(bridge, key, size)
        if (cached) return [key, cached] as const
      }

      const bytes = await fetchPng(PATHS[key])
      const resized = await resizePng(bytes, size)
      if (bridge) {
        saveCached(bridge, key, size, resized)
      }
      return [key, resized] as const
    }),
  )
  return Object.fromEntries(entries) as CoinAssets
}
