export interface Preview {
  updateDrizzle(content: string): void
  updateStatus(content: string): void
  updateCoin(bytes: Uint8Array): void
}

let coinPaintSeq = 0

function paintCoin(canvas: HTMLCanvasElement, bytes: Uint8Array): void {
  const seq = ++coinPaintSeq
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: 'image/png',
  })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => {
    if (seq !== coinPaintSeq) {
      URL.revokeObjectURL(url)
      return
    }
    const w = canvas.width
    const h = canvas.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      URL.revokeObjectURL(url)
      return
    }
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h)
    const px = data.data
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

export function setupPreview(): Preview | null {
  const drizzleEl = document.getElementById('mirror-drizzle')
  const statusEl = document.getElementById('mirror-status')
  const coinCanvas = document.getElementById(
    'mirror-coin',
  ) as HTMLCanvasElement | null
  if (!drizzleEl || !statusEl || !coinCanvas) return null

  return {
    updateDrizzle(content) {
      drizzleEl.textContent = content
    },
    updateStatus(content) {
      statusEl.textContent = content.trim()
    },
    updateCoin(bytes) {
      paintCoin(coinCanvas, bytes)
    },
  }
}

const BG_TOGGLE_KEY = 'bgPattern'

export function setupBgToggle(
  onChange: (enabled: boolean) => void,
): boolean {
  const el = document.getElementById('bg-toggle') as HTMLInputElement | null
  let initial = true
  try {
    const stored = window.localStorage.getItem(BG_TOGGLE_KEY)
    if (stored === 'off') initial = false
  } catch {
    /* localStorage unavailable */
  }
  if (el) {
    el.checked = initial
    el.addEventListener('change', () => {
      const enabled = el.checked
      try {
        window.localStorage.setItem(BG_TOGGLE_KEY, enabled ? 'on' : 'off')
      } catch {
        /* ignore */
      }
      onChange(enabled)
    })
  }
  return initial
}
