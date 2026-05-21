const DEFAULT_TIMEOUT_MS = 5000

let queue: Promise<unknown> = Promise.resolve()

function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Bridge call timed out after ${timeoutMs}ms`)),
      timeoutMs,
    )
  })
  return Promise.race([fn(), timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer)
  })
}

export function enqueue<T>(
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const wrapped = () => withTimeout(fn, timeoutMs)
  const next = queue.then(wrapped, wrapped)
  queue = next.catch(() => {})
  return next as Promise<T>
}
