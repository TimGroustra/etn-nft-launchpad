export type RetryOptions = {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  shouldRetry?: (error: unknown, attempt: number) => boolean
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (message.includes('fetch failed')) return true
    if (message.includes('network')) return true
    if (message.includes('timeout')) return true
    if (/failed \(\d{3}\)/.test(message)) {
      const match = message.match(/\((\d{3})\)/)
      if (match) return isRetryableHttpStatus(Number(match[1]))
    }
    if (/:\s(408|429|5\d{2})\b/.test(error.message)) {
      const match = error.message.match(/:\s(\d{3})\b/)
      if (match) return isRetryableHttpStatus(Number(match[1]))
    }
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5
  const baseDelayMs = options.baseDelayMs ?? 1_000
  const maxDelayMs = options.maxDelayMs ?? 30_000
  const shouldRetry = options.shouldRetry ?? isRetryableError

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
        throw error
      }
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
      options.onRetry?.(error, attempt, delayMs)
      await sleep(delayMs)
    }
  }

  throw lastError
}

export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      await fn(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
}
