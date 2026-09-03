import { fetchNftMetadata, type NftMetadata } from './nftFetcher'

type NftCacheKey = string

const metadataCache = new Map<NftCacheKey, NftMetadata>()
const fetchPromises = new Map<NftCacheKey, Promise<NftMetadata | null>>()

function getCacheKey(contractAddress: string, tokenId: number): NftCacheKey {
  return `${contractAddress.toLowerCase()}:${tokenId}`
}

/** Pre-warm the in-memory metadata cache from a batch Supabase lookup. */
export function prewarmMetadataCache(
  entries: Map<string, NftMetadata> | Iterable<[string, NftMetadata]>,
) {
  for (const [key, metadata] of entries) {
    metadataCache.set(key, metadata)
  }
}

export async function getCachedNftMetadata(
  contractAddress: string,
  tokenId: number,
): Promise<NftMetadata | null> {
  const key = getCacheKey(contractAddress, tokenId)

  if (metadataCache.has(key)) return metadataCache.get(key)!

  if (fetchPromises.has(key)) return fetchPromises.get(key)!

  const fetchPromise = (async () => {
    const result = await fetchNftMetadata(contractAddress, tokenId)
    if (result.ok) {
      metadataCache.set(key, result.metadata)
      return result.metadata
    }
    return null
  })()

  fetchPromises.set(key, fetchPromise)

  try {
    return await fetchPromise
  } finally {
    fetchPromises.delete(key)
  }
}
