import * as THREE from 'three'
import { parseGIF, decompressFrames } from 'gifuct-js'
import { getGatewayCandidates } from './urlUtils'

export interface GifTextureResult {
  texture: THREE.CanvasTexture
  stop: () => void
  width: number
  height: number
}

async function fetchGifBytes(gifUrl: string): Promise<ArrayBuffer> {
  let lastError: unknown
  for (const candidate of getGatewayCandidates(gifUrl)) {
    try {
      const res = await fetch(candidate, { mode: 'cors' })
      if (res.ok) return await res.arrayBuffer()
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to fetch GIF')
}

export async function createGifTexture(gifUrl: string): Promise<GifTextureResult> {
  const arrayBuffer = await fetchGifBytes(gifUrl)

  const gif = parseGIF(arrayBuffer)
  const frames = decompressFrames(gif, true)
  if (frames.length === 0) throw new Error('GIF contains no frames.')

  const width = frames[0].dims.width
  const height = frames[0].dims.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context for canvas.')
  const context = ctx

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.format = THREE.RGBAFormat
  texture.needsUpdate = true

  let frameIndex = 0
  let running = true
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  function loop() {
    if (!running) return
    const f = frames[frameIndex]
    const imageData = new ImageData(new Uint8ClampedArray(f.patch), f.dims.width, f.dims.height)
    context.putImageData(imageData, f.dims.left, f.dims.top)
    texture.needsUpdate = true
    const delayMs = (f.delay || 10) * 10
    frameIndex = (frameIndex + 1) % frames.length
    timeoutId = setTimeout(loop, delayMs)
  }

  loop()

  const stop = () => {
    running = false
    if (timeoutId !== null) clearTimeout(timeoutId)
    texture.dispose()
  }

  return { texture, stop, width, height }
}
