import { fetchTotalSupply } from '@/lib/gallery-fetcher/nftFetcher'
import { supabase } from '@/lib/supabase'

const ETN_VIDEO_NFT_ADDRESS = '0x7F41080A13f5154Bcf9f72991AFEEd645b13B75C'

export const GALLERY_MINTED_IDS_CACHE_TTL_MS = 10 * 60 * 1000

function sortMintedTokenIds(mintedTokenIds: number[]): number[] {
  return [...new Set(mintedTokenIds.filter((id) => Number.isInteger(id) && id > 0))].sort(
    (a, b) => a - b,
  )
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

  const totalMinted = await fetchTotalSupply(contractAddress)
  if (!totalMinted || totalMinted <= 0) return []
  return Array.from({ length: totalMinted }, (_, index) => index + 1)
}

/** On-chain minted token IDs for gallery panels and marketplace links. */
export async function fetchGalleryMintedTokenIds(contractAddress: string): Promise<number[]> {
  if (contractAddress === ETN_VIDEO_NFT_ADDRESS) return [1]

  const fromSupabase = await readSupabaseMintedIdsCache(contractAddress)
  if (fromSupabase) return fromSupabase

  const fromEdge = await invokeMintedIdsRefresh(contractAddress)
  if (fromEdge) return fromEdge

  return fetchMintedTokenIdsClientFallback(contractAddress)
}

export type GalleryPanelTokenResolution = {
  /** Token IDs shown on the panel and used for artwork. */
  tokenIds: number[]
  /** On-chain minted IDs used to validate marketplace links. */
  mintedTokenIds: number[]
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
  if (mintedTokenIds.length === 0) return true
  return mintedTokenIds.includes(tokenId)
}

/** Read minted ID lists from Supabase only — never hits chain RPC. */
export async function fetchAllMintedTokenIdsFromSupabase(
  contractAddresses: string[],
): Promise<Record<string, number[]>> {
  const tokenMap: Record<string, number[]> = {}
  const unique = [...new Set(contractAddresses.map((a) => a.toLowerCase()).filter(Boolean))]
  if (unique.length === 0) return tokenMap

  type MintedIdsRow = { contract_address: string; minted_token_ids: number[] | null }
  const { data } = await supabase
    .from('gallery_contract_minted_ids')
    .select('contract_address, minted_token_ids')

  for (const row of (data ?? []) as MintedIdsRow[]) {
    const contract = String(row.contract_address).toLowerCase()
    const ids = (row.minted_token_ids ?? []) as number[]
    if (ids.length > 0) tokenMap[contract] = sortMintedTokenIds(ids)
  }

  for (const contract of unique) {
    if (contract === ETN_VIDEO_NFT_ADDRESS.toLowerCase()) {
      tokenMap[contract] = [1]
    }
  }

  return tokenMap
}
