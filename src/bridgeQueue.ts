// Serial bridge-call queue.
//
// Every bridge call runs strictly one at a time: the next call starts only after
// the previous call has fully settled. The Even SDK must never see two BLE calls
// in flight at once — concurrent calls crash the G2 connection, which on the
// device shows up as a frozen app that needs a relaunch.
//
// The per-call timeout is for AWAITER liveness only (so the flip loop isn't held
// hostage by a slow call); it deliberately does NOT advance the chain. Abandoning
// a call to the chain while its BLE send is still on the wire is exactly the
// concurrent-call collision we're avoiding. The chain advances only when the real
// call settles — with a generous hard cap as a last resort so a genuinely dead
// link can't wedge the queue forever.

const DEFAULT_TIMEOUT_MS = 5000
const HARD_SETTLE_CAP_MS = 12000

let tail: Promise<unknown> = Promise.resolve()

export function enqueue<T>(
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  let resolveCaller!: (value: T) => void
  let rejectCaller!: (reason: unknown) => void
  const caller = new Promise<T>((resolve, reject) => {
    resolveCaller = resolve
    rejectCaller = reject
  })


  const run = (): Promise<void> => {
    const real = fn()

    // Liveness for the awaiter only — this never advances the chain, so a slow
    // call's BLE send is never abandoned mid-flight to make room for the next.
    const callerTimer = setTimeout(() => {
      rejectCaller(new Error(`Bridge call timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    real.then(
      value => {
        clearTimeout(callerTimer)
        resolveCaller(value)
      },
      reason => {
        clearTimeout(callerTimer)
        rejectCaller(reason)
      },
    )

    // Advance the chain only when the real call settles (so the SDK never has two
    // calls on the wire at once), or after a generous hard cap far above real call
    // latency (~0.5–2s) so a dead link can't wedge the queue permanently.
    return new Promise<void>(resolve => {
      let advanced = false
      let hardTimer: ReturnType<typeof setTimeout>
      const advance = (): void => {
        if (advanced) return
        advanced = true
        clearTimeout(hardTimer)
        resolve()
      }
      hardTimer = setTimeout(advance, HARD_SETTLE_CAP_MS)
      real.then(advance, advance)
    })
  }

  tail = tail.then(run, run)
  return caller
}
