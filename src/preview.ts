export interface Preview {
  updateDrizzle(content: string): void
  updateStatus(content: string): void
  updateTally(heads: string, tails: string): void
  updateCoin(bytes: Uint8Array): void
  /** null clears the banner (leaving the home screen). */
  updateBanner(bytes: Uint8Array | null): void
  /** Home-screen option rows; '' clears them. */
  updateHome(content: string): void
}

// Per-canvas painter with its own sequence counter, so a slow decode can't
// paint over a newer frame.
function makePainter(canvas: HTMLCanvasElement) {
  let paintSeq = 0
  return (bytes: Uint8Array | null): void => {
    const seq = ++paintSeq
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (!bytes) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      return
    }
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
      type: 'image/png',
    })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      if (seq !== paintSeq) {
        URL.revokeObjectURL(url)
        return
      }
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h)
      const px = data.data
      // Not a debug tint: luminance goes into the green channel only so the
      // phone preview matches the G2's green monochrome display (the same look
      // as the #3CFA44 text mirror in index.html).
      for (let i = 0; i < px.length; i += 4) {
        const lum = (px[i] + px[i + 1] + px[i + 2]) / 3
        px[i] = 0
        px[i + 1] = lum
        px[i + 2] = 0
      }
      ctx.putImageData(data, 0, 0)
      URL.revokeObjectURL(url)
    }
    img.onerror = () => URL.revokeObjectURL(url)
    img.src = url
  }
}

export function setupPreview(): Preview | null {
  const drizzleEl = document.getElementById('mirror-drizzle')
  const statusEl = document.getElementById('mirror-status')
  const headsEl = document.getElementById('mirror-heads')
  const tailsEl = document.getElementById('mirror-tails')
  const coinCanvas = document.getElementById(
    'mirror-coin',
  ) as HTMLCanvasElement | null
  const bannerCanvas = document.getElementById(
    'mirror-banner',
  ) as HTMLCanvasElement | null
  const homeEl = document.getElementById('mirror-home')
  if (
    !drizzleEl ||
    !statusEl ||
    !headsEl ||
    !tailsEl ||
    !coinCanvas ||
    !bannerCanvas ||
    !homeEl
  )
    return null

  const paintCoin = makePainter(coinCanvas)
  const paintBanner = makePainter(bannerCanvas)

  return {
    updateDrizzle(content) {
      drizzleEl.textContent = content
    },
    updateStatus(content) {
      statusEl.textContent = content.trim()
    },
    updateTally(heads, tails) {
      headsEl.textContent = heads
      tailsEl.textContent = tails
    },
    updateCoin(bytes) {
      paintCoin(bytes)
    },
    updateBanner(bytes) {
      paintBanner(bytes)
    },
    updateHome(content) {
      homeEl.textContent = content
    },
  }
}

export function primeToggle(id: string, checked: boolean): void {
  const el = document.getElementById(id) as HTMLInputElement | null
  if (el) el.checked = checked
}

export function setupToggle(
  id: string,
  initial: boolean,
  onChange: (enabled: boolean) => void,
): void {
  const el = document.getElementById(id) as HTMLInputElement | null
  if (!el) return
  el.checked = initial
  el.addEventListener('change', () => onChange(el.checked))
  // Controls ship disabled in the HTML until the persisted state has loaded
  // and this wiring exists — before that, a tap would do nothing and the
  // synchronous peek can't see values that only live in the SDK store.
  el.disabled = false
}

export function primeSelect(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLSelectElement | null
  if (el) el.value = value
}

export function setupSelect(
  id: string,
  initial: string,
  onChange: (value: string) => void,
): void {
  const el = document.getElementById(id) as HTMLSelectElement | null
  if (!el) return
  el.value = initial
  el.addEventListener('change', () => onChange(el.value))
  el.disabled = false
}

