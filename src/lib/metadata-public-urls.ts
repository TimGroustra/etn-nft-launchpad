const DEFAULT_APP_ORIGIN = 'https://www.etn-nft-launchpad.club'

/** Public origin used for on-chain metadata and marketplace-facing asset URLs. */
export function getMetadataPublicOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin
  const fromEnv = import.meta.env.VITE_APP_URL?.trim()
  return (fromEnv || DEFAULT_APP_ORIGIN).replace(/\/$/, '')
}

/** Base URI for IMintable public mint metadata: `{base}{tokenId}.json` */
export function getCollectionMetadataBaseUri(collectionId: string): string {
  return `${getMetadataPublicOrigin()}/m/${collectionId}/`
}

export function getPublicMetadataUrl(collectionId: string, tokenId: number): string {
  return `${getMetadataPublicOrigin()}/m/${collectionId}/${tokenId}.json`
}

/** Proxy URL for a file in the gallery-cache bucket (`{contract}/{tokenId}.ext`). */
export function getGalleryCachePublicUrl(storagePath: string): string {
  if (!storagePath) return ''
  const normalized = storagePath.replace(/^\/+/, '')
  return `${getMetadataPublicOrigin()}/g/${normalized}`
}

/** Proxy URL for a file in the collection-images bucket (`{collectionId}/{tokenId}.png`). */
export function getPublicImageUrlFromPath(imageStoragePath: string, cacheBust?: string | number): string {
  if (!imageStoragePath) return ''
  const normalized = imageStoragePath.replace(/^\/+/, '')
  const base = `${getMetadataPublicOrigin()}/i/${normalized}`
  if (cacheBust == null || cacheBust === '') return base
  return `${base}?v=${encodeURIComponent(String(cacheBust))}`
}
