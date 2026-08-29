import { getGalleryCachePublicUrl } from '@/lib/metadata-public-urls'
import { supabase } from '@/lib/supabase'
import type { NftMetadata } from '@/lib/gallery-fetcher/nftFetcher'

type CacheRow = {
  title: string | null
  content_type: string
  storage_path: string
}

export { getGalleryCachePublicUrl }

export async function getCachedGalleryMetadata(
  contractAddress: string,
  tokenId: number,
): Promise<NftMetadata | null> {
  const { data, error } = await supabase
    .from('gallery_media_cache')
    .select('title, content_type, storage_path')
    .eq('contract_address', contractAddress.toLowerCase())
    .eq('token_id', tokenId)
    .maybeSingle()

  if (error || !data) return null

  const row = data as CacheRow
  if (!row.storage_path) return null

  const contentUrl = getGalleryCachePublicUrl(row.storage_path)
  return {
    title: row.title || `Token #${tokenId}`,
    description: '',
    contentUrl,
    contentType: row.content_type || 'image/jpeg',
    source: contentUrl,
  }
}

/** Gentle background nudge so queued panel images keep warming while the gallery is open. */
export function nudgeGalleryCacheWorker() {
  void supabase.functions.invoke('gallery-cache-tick', { method: 'POST', body: {} })
}
