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

export function resolveGalleryPanelTokenIds(
  contractAddress: string,
  mintedTokenIds: number[],
  defaultTokenId: number,
  showCollection: boolean,
): GalleryPanelTokenResolution {
  const minted = [...new Set(mintedTokenIds.filter((id) => Number.isInteger(id) && id > 0))].sort(
    (a, b) => a - b,
  )
  const pinnedId = Math.max(1, defaultTokenId)

  if (isGemShardsGalleryContract(contractAddress)) {
    if (showCollection) {
      return { tokenIds: minted, mintedTokenIds: minted }
    }
    // Gem Shards preview art exists for every ID 1-495; only marketplace links require minted IDs.
    return { tokenIds: [pinnedId], mintedTokenIds: minted }
  }

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
