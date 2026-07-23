import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { decodePng, fetchPng, renderProcessed } from './assets'
import { loadCached, saveCached } from './cache'

// Only the d6 ships for now. The d4–d20 support (blank base dice + engraved
// numerals composited into per-die face windows) was removed 2026-07-23 and
// lives in git history should more dice return.
export const DIE_FACES = 6

// Bump when the art in public/dice/ or the pose table changes, so stale
// processed copies in the kv cache are abandoned.
const DICE_ASSET_VERSION = 'a8'

// All dice art is authored on a 288×288 canvas; results are transformed at
// that size, then run through the same downscale/quantize pass as the coin.
// See assets/dice-asset-spec.md.
const SRC_SIZE = 288

// Mid-roll poses: the 3D corner-view art rotated in 45° steps. Every pose is
// a visibly different angle — the roll animation never repeats a pose on
// consecutive frames, so pips can't change without the die turning. Axis
// rotations keep the scale-up that matches the head-on face size; diagonal
// rotations shrink so the rotated art fits the square canvas.
interface TumblePose {
  angle: number
  scale: number
}

const POSES: readonly TumblePose[] = [0, 45, 90, 135, 180, 225, 270, 315].map(
  angle => ({ angle, scale: angle % 90 === 0 ? 1.18 : 0.95 }),
)

// Poses with the scaled-up axis-aligned framing — the largest silhouettes.
// The roll ends its tumble on one of these so the size flows into the
// full-size head-on face instead of jumping up from a shrunken diagonal.
const LARGE_POSES: readonly number[] = POSES.flatMap((pose, i) =>
  pose.angle % 90 === 0 ? [i] : [],
)

// Settle frame: the result's head-on face tilted 45°, shown between the last
// tumble pose and the final face so the die visibly rotates into its resting
// position. 0.95 matches the diagonal tumble scale (reads as the tail of the
// bounce) and keeps the art inside the frame — the face art's max radial
// extent is ~149px on the 288 canvas, so anything under 144/149 ≈ 0.97 fits
// at any rotation.
const SETTLE_ANGLE = 45
const SETTLE_SCALE = 0.95

export interface DieAssets {
  faces: number
  /** Number of tumble poses available. */
  poseCount: number
  /** Pose indices with the large axis-aligned framing (see LARGE_POSES). */
  largePoses: readonly number[]
  /** Processed result face for a rolled value (built lazily, memoized). */
  face(value: number): Promise<Uint8Array>
  /** The result face mid-settle: head-on art tilted 45°, slightly shrunk. */
  faceSettle(value: number): Promise<Uint8Array>
  /** A face caught mid-roll in the given pose (0..poseCount-1). */
  tumble(value: number, pose: number): Promise<Uint8Array>
}

// Raw decoded source images are fetched at most once per session.
const decodedImages = new Map<string, Promise<HTMLImageElement>>()

function imageAt(path: string): Promise<HTMLImageElement> {
  let p = decodedImages.get(path)
  if (!p) {
    p = fetchPng(path).then(decodePng)
    // Evict on failure so a transient fetch/decode error doesn't poison the
    // cache for the whole session — the next roll retries the load.
    p.catch(() => {
      if (decodedImages.get(path) === p) decodedImages.delete(path)
    })
    decodedImages.set(path, p)
  }
  return p
}

function cacheLabel(suffix: string): string {
  return `dice:${DICE_ASSET_VERSION}:${suffix}`
}

function rotatedSource(
  src: CanvasImageSource,
  angle: number,
  scale: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = SRC_SIZE
  canvas.height = SRC_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to acquire 2D canvas context')
  ctx.translate(SRC_SIZE / 2, SRC_SIZE / 2)
  ctx.rotate((angle * Math.PI) / 180)
  ctx.scale(scale, scale)
  ctx.translate(-SRC_SIZE / 2, -SRC_SIZE / 2)
  ctx.drawImage(src, 0, 0, SRC_SIZE, SRC_SIZE)
  return canvas
}

export async function loadDieAssets(
  size: number,
  bridge?: EvenAppBridge,
): Promise<DieAssets> {
  // Every processed image is memoized in-session and kv-cached across sessions.
  const memo = new Map<string, Promise<Uint8Array>>()
  const processed = (
    key: string,
    source: () => Promise<CanvasImageSource>,
    transform: (src: CanvasImageSource) => CanvasImageSource,
  ): Promise<Uint8Array> => {
    let p = memo.get(key)
    if (!p) {
      const built = (async () => {
        const label = cacheLabel(`d6-${key}`)
        if (bridge) {
          const cached = await loadCached(bridge, label, size)
          if (cached) return cached
        }
        const out = renderProcessed(transform(await source()), size)
        if (bridge) saveCached(bridge, label, size, out)
        return out
      })()
      // Evict on failure — a memoized rejection would permanently break this
      // face/pose for the session; evicting lets the next roll retry.
      built.catch(() => {
        if (memo.get(key) === built) memo.delete(key)
      })
      memo.set(key, built)
      p = built
    }
    return p
  }

  return {
    faces: DIE_FACES,
    poseCount: POSES.length,
    largePoses: LARGE_POSES,
    face: value =>
      processed(`f${value}`, () => imageAt(`/dice/d6-${value}.png`), src => src),
    faceSettle: value =>
      processed(
        `s${value}`,
        () => imageAt(`/dice/d6-${value}.png`),
        src => rotatedSource(src, SETTLE_ANGLE, SETTLE_SCALE),
      ),
    tumble: (value, poseIdx) => {
      const pose = POSES[poseIdx]
      return processed(
        `t${value}-${poseIdx}`,
        () => imageAt(`/dice/d6-iso-${value}.png`),
        src => rotatedSource(src, pose.angle, pose.scale),
      )
    },
  }
}
