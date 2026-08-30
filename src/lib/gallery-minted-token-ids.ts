import { createPublicClient, http } from 'viem'
import { electroneum } from '@/lib/blockchain'
import { fetchGemShardMintedTokenIds } from '@/lib/gem-shard-logs'
import { fetchTotalSupply } from '@/lib/gallery-fetcher/nftFetcher'

const GEM_SHARDS_MAINNET = '0x6cb09b4cb3d2dca90e720565c101500abe131001'

const galleryPublicClient = createPublicClient({
  chain: electroneum,
  transport: http(),
})

function isGemShardsContract(contractAddress: string): boolean {
  return contractAddress.toLowerCase() === GEM_SHARDS_MAINNET
}

/** On-chain minted token IDs for gallery panels and marketplace links. */
export async function fetchGalleryMintedTokenIds(contractAddress: string): Promise<number[]> {
  if (isGemShardsContract(contractAddress)) {
    return fetchGemShardMintedTokenIds(
      galleryPublicClient,
      contractAddress as `0x${string}`,
    )
  }

  const totalMinted = await fetchTotalSupply(contractAddress)
  if (!totalMinted || totalMinted <= 0) return []
  return Array.from({ length: totalMinted }, (_, index) => index + 1)
}

export function resolveGalleryPanelTokenIds(
  mintedTokenIds: number[],
  defaultTokenId: number,
  showCollection: boolean,
): number[] {
  const minted = [...new Set(mintedTokenIds.filter((id) => Number.isInteger(id) && id > 0))].sort(
    (a, b) => a - b,
  )
  if (minted.length === 0) return []

  if (showCollection) return minted

  const pinnedId = Math.max(1, defaultTokenId)
  return minted.includes(pinnedId) ? [pinnedId] : []
}
