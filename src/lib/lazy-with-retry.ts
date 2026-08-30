import { lazy, type ComponentType } from 'react'

const CHUNK_RELOAD_KEY = 'vite-chunk-reload'

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('error loading dynamically imported module')
  )
}

/** Lazy-load a route chunk; reload once if a deploy invalidated cached asset hashes. */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importer: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const module = await importer()
      sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      return module
    } catch (error) {
      if (isChunkLoadError(error) && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
        window.location.reload()
        return { default: (() => null) as unknown as T }
      }
      throw error
    }
  })
}
