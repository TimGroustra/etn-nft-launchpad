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

export type GalleryPanelMediaStatus = {
  panelKey: string
  contractAddress: string
  tokenId: number
  isCached: boolean
  metadata: NftMetadata | null
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

function cacheKey(contractAddress: string, tokenId: number): string {
  return `${contractAddress.toLowerCase()}:${tokenId}`
}

const memoryCache = new Map<string, NftMetadata>()

export function prewarmGalleryMetadataCache(
  entries: Map<string, NftMetadata> | Iterable<[string, NftMetadata]>,
) {
  for (const [key, metadata] of entries) {
    memoryCache.set(key, metadata)
  }
}

export function getPrewarmedGalleryMetadata(
  contractAddress: string,
  tokenId: number,
): NftMetadata | null {
  return memoryCache.get(cacheKey(contractAddress, tokenId)) ?? null
}

export async function getCachedGalleryMetadata(
  contractAddress: string,
  tokenId: number,
): Promise<NftMetadata | null> {
  const key = cacheKey(contractAddress, tokenId)
  const cached = memoryCache.get(key)
  if (cached) return cached

  const { data, error } = await supabase
    .from('gallery_media_cache')
    .select('contract_address, token_id, title, content_type, storage_path')
    .eq('contract_address', contractAddress.toLowerCase())
    .eq('token_id', tokenId)
    .maybeSingle()

  if (error || !data) return null
  const metadata = rowToMetadata(data as CacheRow)
  if (metadata) memoryCache.set(key, metadata)
  return metadata
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

  const wanted = new Set(pairs.map((p) => cacheKey(p.contractAddress, p.tokenId)))

  for (const row of data as CacheRow[]) {
    const key = cacheKey(row.contract_address, row.token_id)
    if (!wanted.has(key)) continue
    const metadata = rowToMetadata(row)
    if (metadata) {
      result.set(key, metadata)
      memoryCache.set(key, metadata)
    }
  }

  return result
}

/** Fast path: panel_key → cached metadata from the indexed panel-token table. */
export async function fetchIndexedPanelGalleryMetadata(): Promise<Map<string, NftMetadata>> {
  const { data: panelRows, error } = await supabase
    .from('gallery_panel_tokens')
    .select('panel_key, contract_address, token_id')

  const byPanel = new Map<string, NftMetadata>()
  if (error || !panelRows?.length) return byPanel

  const pairs = panelRows.map((row) => ({
    contractAddress: String(row.contract_address),
    tokenId: Number(row.token_id),
  }))
  const cached = await getCachedGalleryMetadataBatch(pairs)

  for (const row of panelRows) {
    const contractAddress = String(row.contract_address)
    const tokenId = Number(row.token_id)
    const metadata = cached.get(cacheKey(contractAddress, tokenId))
    if (metadata) byPanel.set(String(row.panel_key), metadata)
  }

  return byPanel
}

/** Indexed manifest: which configured panels have Supabase-cached media vs still warming. */
export async function fetchGalleryPanelMediaManifest(): Promise<GalleryPanelMediaStatus[]> {
  const { data: panelRows, error: panelError } = await supabase
    .from('gallery_panel_tokens')
    .select('panel_key, contract_address, token_id')

  if (panelError || !panelRows?.length) return []

  const pairs = panelRows.map((row) => ({
    contractAddress: String(row.contract_address),
    tokenId: Number(row.token_id),
  }))
  const cached = await getCachedGalleryMetadataBatch(pairs)

  return panelRows.map((row) => {
    const contractAddress = String(row.contract_address)
    const tokenId = Number(row.token_id)
    const key = cacheKey(contractAddress, tokenId)
    const metadata = cached.get(key) ?? null
    return {
      panelKey: String(row.panel_key),
      contractAddress,
      tokenId,
      isCached: metadata != null,
      metadata,
    }
  })
}

const GALLERY_CACHE_POLL_MS = 1500
const GALLERY_CACHE_POLL_ATTEMPTS = 20

/** Poll Supabase only — never hits chain RPC. Used when gallery cache is still warming. */
export async function waitForGalleryCachedMetadata(
  contractAddress: string,
  tokenId: number,
): Promise<NftMetadata | null> {
  for (let attempt = 0; attempt < GALLERY_CACHE_POLL_ATTEMPTS; attempt++) {
    const metadata = await getCachedGalleryMetadata(contractAddress, tokenId)
    if (metadata) return metadata
    await new Promise((resolve) => setTimeout(resolve, GALLERY_CACHE_POLL_MS))
  }
  return null
}

/** Request server-side cache warming for specific tokens (no client RPC). */
export function enqueueGalleryTokens(contractAddress: string, tokenIds: number[]) {
  void supabase.functions.invoke('gallery-cache-tick', {
    method: 'POST',
    body: { enqueueTokens: [{ contractAddress, tokenIds }] },
  })
}

/** Gentle background nudge — processes the warming queue only (no re-index or prune). */
export function nudgeGalleryCacheWorker() {
  void supabase.functions.invoke('gallery-cache-tick', {
    method: 'POST',
    body: { warmOnly: true },
  })
}

/** Enqueue all configured panel tokens for server-side media warming. */
export function enqueueGalleryPanelTokens() {
  void supabase.functions.invoke('gallery-cache-tick', {
    method: 'POST',
    body: { enqueuePanels: true },
  })
}

/** Ask server to refresh panel-token index from gallery_config. */
export function syncGalleryPanelTokenIndex() {
  void supabase.functions.invoke('gallery-cache-tick', {
    method: 'POST',
    body: { syncPanels: true },
  })
}
