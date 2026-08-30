import { createPublicClient, http } from 'viem'
import { electroneum } from '@/lib/blockchain'
import { fetchGemShardMintedTokenIds } from '@/lib/gem-shard-logs'
import { fetchTotalSupply } from '@/lib/gallery-fetcher/nftFetcher'

export const GEM_SHARDS_GALLERY_ADDRESS = '0x6cb09b4cb3d2dca90e720565c101500abe131001'

const galleryPublicClient = createPublicClient({
  chain: electroneum,
  transport: http(),
})

export function isGemShardsGalleryContract(contractAddress: string): boolean {
  return contractAddress.toLowerCase() === GEM_SHARDS_GALLERY_ADDRESS
}

function sortMintedTokenIds(mintedTokenIds: number[]): number[] {
  return [...new Set(mintedTokenIds.filter((id) => Number.isInteger(id) && id > 0))].sort(
    (a, b) => a - b,
  )
}

/** On-chain minted token IDs for gallery panels and marketplace links. */
export async function fetchGalleryMintedTokenIds(contractAddress: string): Promise<number[]> {
  if (isGemShardsGalleryContract(contractAddress)) {
    return fetchGemShardMintedTokenIds(
      galleryPublicClient,
      contractAddress as `0x${string}`,
    )
  }

  const totalMinted = await fetchTotalSupply(contractAddress)
  if (!totalMinted || totalMinted <= 0) return []
  return Array.from({ length: totalMinted }, (_, index) => index + 1)
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
