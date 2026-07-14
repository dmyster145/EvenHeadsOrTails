// Workaround for an Even Hub SDK 0.0.12 image bug.
//
// 0.0.12's changelog claims "LZ4 compression internally" for image raw data, but
// the shipped bundle only half-implements it: `ImageRawDataUpdate.toJson()` — the
// static serializer the SDK's own `updateImageRawData()` calls before posting to
// native — unconditionally stamps `compressMode: 2` (LZ4) on the payload, yet the
// bundle contains no LZ4 code, so the bytes go out uncompressed. The host receives
// raw PNG bytes labeled as LZ4 and rejects every image send with `sendFailed`:
// text/HUD render fine, but no image ever appears. `compressMode` can't be
// overridden via the constructor — `toJson` hardcodes 2.
//
// Fix: wrap the static `toJson` once at startup to strip the bogus field,
// restoring the exact pre-0.0.12 wire shape that every current host accepts. ES
// module export identity means the SDK's internal `toJson` call resolves to this
// same (now-patched) method object.
//
// Remove once the SDK ships real LZ4 compression or stops tagging uncompressed
// data with `compressMode`, then re-verify images after upgrading.
// Discovered 2026-07-13 during the 0.0.10 → 0.0.12 bump; same fix lives in
// EvenChess (`src/evenhub/bridge.ts`).

import { ImageRawDataUpdate } from '@evenrealities/even_hub_sdk'

/** Strip the mislabeled compressMode:2 that 0.0.12 puts on uncompressed image payloads. */
export function patchImageCompressModeBug(): void {
  const cls = ImageRawDataUpdate as unknown as {
    toJson?: (model?: unknown) => Record<string, unknown>
    __compressModePatched?: boolean
  }
  if (typeof cls.toJson !== 'function' || cls.__compressModePatched) return
  const orig = cls.toJson.bind(ImageRawDataUpdate)
  cls.toJson = (model?: unknown) => {
    const json = orig(model)
    if (json && typeof json === 'object' && 'compressMode' in json) {
      delete (json as Record<string, unknown>).compressMode
    }
    return json
  }
  cls.__compressModePatched = true
}
