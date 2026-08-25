const DEFAULT_APP_ORIGIN = 'https://www.etn-nft-launchpad.club'

export function getMetadataPublicOrigin(): string {
  const fromEnv = Deno.env.get('METADATA_PUBLIC_ORIGIN')?.trim()
    || Deno.env.get('VITE_APP_URL')?.trim()
  return (fromEnv || DEFAULT_APP_ORIGIN).replace(/\/$/, '')
}

export function getCollectionMetadataBaseUri(collectionId: string): string {
  return `${getMetadataPublicOrigin()}/m/${collectionId}/`
}

export function getPublicMetadataUrl(collectionId: string, tokenId: number): string {
  return `${getMetadataPublicOrigin()}/m/${collectionId}/${tokenId}.json`
}

export function getPublicImageUrlFromPath(imageStoragePath: string): string {
  if (!imageStoragePath) return ''
  const normalized = imageStoragePath.replace(/^\/+/, '')
  return `${getMetadataPublicOrigin()}/i/${normalized}`
}
