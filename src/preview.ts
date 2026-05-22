export interface Preview {
  updateDrizzle(content: string): void
  updateStatus(content: string): void
  updateTally(heads: string, tails: string): void
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
  const headsEl = document.getElementById('mirror-heads')
  const tailsEl = document.getElementById('mirror-tails')
  const coinCanvas = document.getElementById(
    'mirror-coin',
  ) as HTMLCanvasElement | null
  if (!drizzleEl || !statusEl || !headsEl || !tailsEl || !coinCanvas) return null

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
      paintCoin(coinCanvas, bytes)
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
}
