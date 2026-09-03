import { createPublicClient, http } from 'viem'
import { electroneum } from '@/lib/blockchain'
import { fetchGemShardMintedTokenIds } from '@/lib/gem-shard-logs'
import { fetchTotalSupply } from '@/lib/gallery-fetcher/nftFetcher'
import { supabase } from '@/lib/supabase'

export const GEM_SHARDS_GALLERY_ADDRESS = '0x6cb09b4cb3d2dca90e720565c101500abe131001'

const ETN_VIDEO_NFT_ADDRESS = '0x7F41080A13f5154Bcf9f72991AFEEd645b13B75C'

const galleryPublicClient = createPublicClient({
  chain: electroneum,
  transport: http(),
})

export const GALLERY_MINTED_IDS_CACHE_TTL_MS = 10 * 60 * 1000

export function isGemShardsGalleryContract(contractAddress: string): boolean {
  return contractAddress.toLowerCase() === GEM_SHARDS_GALLERY_ADDRESS
}

function sortMintedTokenIds(mintedTokenIds: number[]): number[] {
  return [...new Set(mintedTokenIds.filter((id) => Number.isInteger(id) && id > 0))].sort(
    (a, b) => a - b,
  )
}

const GEM_SHARDS_IDS_CACHE_KEY = 'gallery-gem-shards-minted-ids'
const GEM_SHARDS_IDS_CACHE_TTL_MS = 30 * 60 * 1000

function readGemShardsMintedIdsCache(): number[] | null {
  try {
    const raw = sessionStorage.getItem(GEM_SHARDS_IDS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ids?: number[]; at?: number }
    if (!parsed.ids?.length || !parsed.at) return null
    if (Date.now() - parsed.at > GEM_SHARDS_IDS_CACHE_TTL_MS) return null
    return parsed.ids
  } catch {
    return null
  }
}

function writeGemShardsMintedIdsCache(ids: number[]) {
  try {
    sessionStorage.setItem(
      GEM_SHARDS_IDS_CACHE_KEY,
      JSON.stringify({ ids, at: Date.now() }),
    )
  } catch {
    // Ignore quota / private mode errors.
  }
}

async function readSupabaseMintedIdsCache(contractAddress: string): Promise<number[] | null> {
  const contract = contractAddress.toLowerCase()
  const { data, error } = await supabase
    .from('gallery_contract_minted_ids')
    .select('minted_token_ids, refreshed_at')
    .eq('contract_address', contract)
    .maybeSingle()

  if (error || !data) return null

  const row = data as { minted_token_ids: number[] | null; refreshed_at: string }
  const refreshedAt = Date.parse(String(row.refreshed_at))
  if (!Number.isFinite(refreshedAt) || Date.now() - refreshedAt > GALLERY_MINTED_IDS_CACHE_TTL_MS) {
    return null
  }

  const ids = row.minted_token_ids ?? []
  return ids.length > 0 ? sortMintedTokenIds(ids) : null
}

const refreshInFlight = new Map<string, Promise<number[] | null>>()

async function invokeMintedIdsRefresh(contractAddress: string): Promise<number[] | null> {
  // Gem Shards refresh is slow server-side; use client/session fallback instead.
  if (isGemShardsGalleryContract(contractAddress)) return null

  const key = contractAddress.toLowerCase()
  if (refreshInFlight.has(key)) return refreshInFlight.get(key)!

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('gallery-refresh-minted-ids', {
        method: 'POST',
        body: { contract_address: contractAddress },
      })
      if (error || !data) return null
      const ids = (data as { minted_token_ids?: number[] }).minted_token_ids
      return ids?.length ? sortMintedTokenIds(ids) : null
    } catch {
      return null
    } finally {
      refreshInFlight.delete(key)
    }
  })()

  refreshInFlight.set(key, promise)
  return promise
}

async function fetchMintedTokenIdsClientFallback(contractAddress: string): Promise<number[]> {
  if (contractAddress === ETN_VIDEO_NFT_ADDRESS) return [1]

  if (isGemShardsGalleryContract(contractAddress)) {
    const cached = readGemShardsMintedIdsCache()
    if (cached) return cached

    const ids = await fetchGemShardMintedTokenIds(
      galleryPublicClient,
      contractAddress as `0x${string}`,
    )
    if (ids.length > 0) writeGemShardsMintedIdsCache(ids)
    return ids
  }

  const totalMinted = await fetchTotalSupply(contractAddress)
  if (!totalMinted || totalMinted <= 0) return []
  return Array.from({ length: totalMinted }, (_, index) => index + 1)
}

/** On-chain minted token IDs for gallery panels and marketplace links. */
export async function fetchGalleryMintedTokenIds(contractAddress: string): Promise<number[]> {
  if (contractAddress === ETN_VIDEO_NFT_ADDRESS) return [1]

  const fromSupabase = await readSupabaseMintedIdsCache(contractAddress)
  if (fromSupabase) {
    if (isGemShardsGalleryContract(contractAddress)) writeGemShardsMintedIdsCache(fromSupabase)
    return fromSupabase
  }

  if (isGemShardsGalleryContract(contractAddress)) {
    const sessionCached = readGemShardsMintedIdsCache()
    if (sessionCached) return sessionCached
  }

  const fromEdge = await invokeMintedIdsRefresh(contractAddress)
  if (fromEdge) {
    if (isGemShardsGalleryContract(contractAddress)) writeGemShardsMintedIdsCache(fromEdge)
    return fromEdge
  }

  return fetchMintedTokenIdsClientFallback(contractAddress)
}

export type GalleryPanelTokenResolution = {
  /** Token IDs shown on the panel and used for artwork. */
  tokenIds: number[]
  /** On-chain minted IDs used to validate marketplace links. */
  mintedTokenIds: number[]
}

/** Assign one minted shard per pinned Gem Shards panel, in stable panel-key order. */
export function resolveGemShardPanelTokenIds(
  mintedTokenIds: number[],
  panelIndex: number,
  showCollection: boolean,
): GalleryPanelTokenResolution {
  const minted = sortMintedTokenIds(mintedTokenIds)
  if (minted.length === 0) {
    return { tokenIds: [], mintedTokenIds: [] }
  }

  if (showCollection) {
    return { tokenIds: minted, mintedTokenIds: minted }
  }

  if (panelIndex < 0 || panelIndex >= minted.length) {
    return { tokenIds: [], mintedTokenIds: minted }
  }

  const tokenId = minted[panelIndex]
  return { tokenIds: [tokenId], mintedTokenIds: minted }
}

export function buildGemShardPanelAssignments(
  panelKeys: string[],
  mintedTokenIds: number[],
  getShowCollection: (panelKey: string) => boolean,
): Map<string, GalleryPanelTokenResolution> {
  const assignments = new Map<string, GalleryPanelTokenResolution>()
  let singlePanelSlot = 0

  for (const panelKey of panelKeys) {
    const showCollection = getShowCollection(panelKey)
    if (showCollection) {
      assignments.set(panelKey, resolveGemShardPanelTokenIds(mintedTokenIds, 0, true))
      continue
    }

    assignments.set(
      panelKey,
      resolveGemShardPanelTokenIds(mintedTokenIds, singlePanelSlot, false),
    )
    singlePanelSlot += 1
  }

  return assignments
}

export function resolveGalleryPanelTokenIds(
  mintedTokenIds: number[],
  defaultTokenId: number,
  showCollection: boolean,
): GalleryPanelTokenResolution {
  const minted = sortMintedTokenIds(mintedTokenIds)
  const pinnedId = Math.max(1, defaultTokenId)

  if (minted.length === 0) {
    return { tokenIds: [], mintedTokenIds: [] }
  }

  if (showCollection) {
    return { tokenIds: minted, mintedTokenIds: minted }
  }

  return {
    tokenIds: minted.includes(pinnedId) ? [pinnedId] : [],
    mintedTokenIds: minted,
  }
}

export function isGalleryTokenMinted(mintedTokenIds: number[], tokenId: number): boolean {
  return mintedTokenIds.includes(tokenId)
}
