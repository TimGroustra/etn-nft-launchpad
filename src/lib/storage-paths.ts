const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const IMAGE_EXT_RE = /^(png|jpe?g|webp|gif)$/i

export function normalizeCollectionId(collectionId: string): string {
  const normalized = collectionId.toLowerCase().trim()
  if (!UUID_RE.test(normalized)) {
    throw new Error('Invalid collection ID')
  }
  return normalized
}

function normalizeStoragePath(path: string): string {
  const trimmed = path.trim().replace(/^\/+/, '')
  if (!trimmed || trimmed.includes('..')) {
    throw new Error('Invalid storage path')
  }
  return trimmed
}

export function getCollectionIdFromStoragePath(path: string): string | null {
  try {
    const normalized = normalizeStoragePath(path)
    const slash = normalized.indexOf('/')
    if (slash <= 0) return null
    const folder = normalized.slice(0, slash).toLowerCase()
    return UUID_RE.test(folder) ? folder : null
  } catch {
    return null
  }
}

export function buildCollectionImagePath(
  collectionId: string,
  tokenId: number,
  extension = 'png',
): string {
  const id = normalizeCollectionId(collectionId)
  if (!Number.isInteger(tokenId) || tokenId < 1) {
    throw new Error('Invalid token ID')
  }
  const ext = extension.toLowerCase().replace(/^\./, '')
  if (!IMAGE_EXT_RE.test(ext)) {
    throw new Error('Invalid image file extension')
  }
  return `${id}/${tokenId}.${ext}`
}

export function buildCollectionMetadataPath(collectionId: string, tokenId: number): string {
  const id = normalizeCollectionId(collectionId)
  if (!Number.isInteger(tokenId) || tokenId < 1) {
    throw new Error('Invalid token ID')
  }
  return `${id}/${tokenId}.json`
}

export function validateCollectionImagePath(
  collectionId: string,
  tokenId: number,
  path: string,
): string | null {
  try {
    const normalized = normalizeStoragePath(path)
    const scopedCollectionId = getCollectionIdFromStoragePath(normalized)
    if (!scopedCollectionId || scopedCollectionId !== normalizeCollectionId(collectionId)) {
      return 'Image path must belong to this collection.'
    }

    const expectedPrefix = `${normalizeCollectionId(collectionId)}/${tokenId}.`
    if (!normalized.startsWith(expectedPrefix)) {
      return 'Image path must match this token ID.'
    }

    const ext = normalized.slice(expectedPrefix.length)
    if (!IMAGE_EXT_RE.test(ext)) {
      return 'Image path must use a supported extension (png, jpg, jpeg, webp, gif).'
    }

    return null
  } catch {
    return 'Invalid storage path.'
  }
}

export function assertStoragePathForCollection(collectionId: string, path: string): string | null {
  try {
    const scopedCollectionId = getCollectionIdFromStoragePath(path)
    if (!scopedCollectionId || scopedCollectionId !== normalizeCollectionId(collectionId)) {
      return 'Storage path belongs to a different collection.'
    }
    return null
  } catch {
    return 'Invalid storage path.'
  }
}

export function extensionFromFileName(name: string): string {
  const idx = name.lastIndexOf('.')
  const ext = idx >= 0 ? name.slice(idx + 1).toLowerCase() : 'png'
  if (!IMAGE_EXT_RE.test(ext)) {
    throw new Error('Unsupported image file extension')
  }
  return ext === 'jpeg' ? 'jpg' : ext
}
