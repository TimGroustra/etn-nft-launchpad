import { getGalleryCachePublicUrl } from '@/lib/metadata-public-urls'
import { supabase } from '@/lib/supabase'
import type { NftMetadata } from '@/lib/gallery-fetcher/nftFetcher'

type CacheRow = {
  contract_address: string
  token_id: number
  title: string | null
  content_type: string
  storage_path: string
}

export { getGalleryCachePublicUrl }

function rowToMetadata(row: CacheRow): NftMetadata | null {
  if (!row.storage_path) return null
  const contentUrl = getGalleryCachePublicUrl(row.storage_path)
  return {
    title: row.title || `Token #${row.token_id}`,
    description: '',
    contentUrl,
    contentType: row.content_type || 'image/jpeg',
    source: contentUrl,
  }
}

export async function getCachedGalleryMetadata(
  contractAddress: string,
  tokenId: number,
): Promise<NftMetadata | null> {
  const { data, error } = await supabase
    .from('gallery_media_cache')
    .select('contract_address, token_id, title, content_type, storage_path')
    .eq('contract_address', contractAddress.toLowerCase())
    .eq('token_id', tokenId)
    .maybeSingle()

  if (error || !data) return null
  return rowToMetadata(data as CacheRow)
}

export async function getCachedGalleryMetadataBatch(
  pairs: Array<{ contractAddress: string; tokenId: number }>,
): Promise<Map<string, NftMetadata>> {
  const result = new Map<string, NftMetadata>()
  if (pairs.length === 0) return result

  const uniqueContracts = [...new Set(pairs.map((p) => p.contractAddress.toLowerCase()))]
  const { data, error } = await supabase
    .from('gallery_media_cache')
    .select('contract_address, token_id, title, content_type, storage_path')
    .in('contract_address', uniqueContracts)

  if (error || !data) return result

  const wanted = new Set(pairs.map((p) => `${p.contractAddress.toLowerCase()}:${p.tokenId}`))

  for (const row of data as CacheRow[]) {
    const key = `${row.contract_address.toLowerCase()}:${row.token_id}`
    if (!wanted.has(key)) continue
    const metadata = rowToMetadata(row)
    if (metadata) result.set(key, metadata)
  }

  return result
}

/** Gentle background nudge so queued panel images keep warming while the gallery is open. */
export function nudgeGalleryCacheWorker() {
  void supabase.functions.invoke('gallery-cache-tick', { method: 'POST', body: {} })
}

/** Enqueue all configured panel tokens for server-side media warming. */
export function enqueueGalleryPanelTokens() {
  void supabase.functions.invoke('gallery-cache-tick', {
    method: 'POST',
    body: { enqueuePanels: true },
  })
}
