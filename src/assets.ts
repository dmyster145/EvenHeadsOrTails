import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
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

const ALPHA_THRESHOLD = 180
const CONTRAST_FACTOR = 1.6

async function resizePng(bytes: Uint8Array, size: number): Promise<Uint8Array> {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: 'image/png',
  })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to acquire 2D canvas context')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, size, size)

    const imageData = ctx.getImageData(0, 0, size, size)
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
    ctx.putImageData(imageData, 0, 0)

    const outBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        b => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
        'image/png',
      )
    })
    return new Uint8Array(await outBlob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
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

      const res = await fetch(PATHS[key])
      if (!res.ok) {
        throw new Error(`Failed to load coin asset ${PATHS[key]}: ${res.status}`)
      }
      const buf = await res.arrayBuffer()
      const bytes = new Uint8Array(buf)
      if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) {
        throw new Error(
          `Asset ${PATHS[key]} does not look like a PNG (got ${bytes.length} bytes, first=${bytes[0]?.toString(16)} ${bytes[1]?.toString(16)})`,
        )
      }
      const resized = await resizePng(bytes, size)
      if (bridge) {
        void saveCached(bridge, key, size, resized)
      }
      return [key, resized] as const
    }),
  )
  return Object.fromEntries(entries) as CoinAssets
}
