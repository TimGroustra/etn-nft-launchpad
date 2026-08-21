const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

export const IMAGE_RULES = {
  maxBytes: 10 * 1024 * 1024,
  minWidth: 256,
  minHeight: 256,
  maxWidth: 4096,
  maxHeight: 4096,
} as const

function fileExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx).toLowerCase() : ''
}

export function validateImageFileSync(file: File): string | null {
  if (!ALLOWED_MIME.has(file.type) && !ALLOWED_EXT.has(fileExtension(file.name))) {
    return 'Image must be PNG, JPEG, WebP, or GIF.'
  }
  if (file.size > IMAGE_RULES.maxBytes) {
    return 'Image must be 10 MB or smaller.'
  }
  if (file.size === 0) {
    return 'Image file is empty.'
  }
  return null
}

export function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image. The file may be corrupt.'))
    }
    img.src = url
  })
}

export async function validateImageFileAsync(file: File): Promise<string | null> {
  const syncError = validateImageFileSync(file)
  if (syncError) return syncError

  try {
    const { width, height } = await loadImageDimensions(file)
    if (width < IMAGE_RULES.minWidth || height < IMAGE_RULES.minHeight) {
      return `Image must be at least ${IMAGE_RULES.minWidth}×${IMAGE_RULES.minHeight}px (yours: ${width}×${height}).`
    }
    if (width > IMAGE_RULES.maxWidth || height > IMAGE_RULES.maxHeight) {
      return `Image must be at most ${IMAGE_RULES.maxWidth}×${IMAGE_RULES.maxHeight}px (yours: ${width}×${height}).`
    }
    return null
  } catch (err) {
    return err instanceof Error ? err.message : 'Invalid image file.'
  }
}
