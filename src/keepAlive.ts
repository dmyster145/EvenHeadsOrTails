// WebView keep-alive.
//
// Best-effort protection against aggressive timer throttling in the constrained
// G2 WebView. A near-silent AudioContext oscillator keeps the page from being
// treated as idle, and a never-resolving Web Lock acts as a second hint.
// Activation must happen from a user-gesture context due to autoplay policy,
// so it is triggered from the first swipe.

let audioCtx: AudioContext | null = null
let oscillator: OscillatorNode | null = null
let gainNode: GainNode | null = null
let active = false

export function activateKeepAlive(): void {
  if (active) return

  try {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) throw new Error('AudioContext unsupported')

    audioCtx = new Ctor()
    oscillator = audioCtx.createOscillator()
    gainNode = audioCtx.createGain()
    oscillator.frequency.value = 1
    gainNode.gain.value = 0.001
    oscillator.connect(gainNode)
    gainNode.connect(audioCtx.destination)
    oscillator.start()
    active = true

    audioCtx.addEventListener('statechange', () => {
      if (audioCtx?.state === 'suspended') {
        audioCtx.resume().catch(() => {})
      }
    })
  } catch {
    // AudioContext unavailable — fall through to the Web Lock hint.
  }

  try {
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      ;(navigator.locks as LockManager)
        .request(
          'heads_or_tails_keep_alive',
          () => new Promise<void>(() => {}),
        )
        .catch(() => {})
    }
  } catch {
    // Noop.
  }
}

export function isKeepAliveActive(): boolean {
  return active
}
