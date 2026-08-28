import { useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getExplorerNftUrl } from '@/lib/blockchain'
import { fetchGemShardsMintDisplayInfo } from '@/lib/gem-shards'
import { useCollectionMintedTokens } from '@/hooks/useCollectionMintedTokens'
import { useLazyInView } from '@/hooks/useLazyInView'
import type { MintedTokenInfo } from '@/components/MintSuccessModal'
import type { Collection } from '@/types/database'

const PAGE_SIZE = 24
const MINTED_INDEX_STALE_MS = 5 * 60_000

type CollectionMintedGalleryProps = {
  collection: Collection
}

function MintedTokenCard({
  token,
  chainId,
  contractAddress,
}: {
  token: MintedTokenInfo
  chainId: number
  contractAddress: string
}) {
  return (
    <a
      href={getExplorerNftUrl(chainId, contractAddress, token.tokenId)}
      target="_blank"
      rel="noreferrer"
      className="group overflow-hidden rounded-lg border border-slate-800 bg-slate-900/50 transition hover:border-slate-600"
    >
      {token.imageUrl ? (
        <img
          src={token.imageUrl}
          alt={token.name}
          className="aspect-square w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-slate-800 text-sm text-slate-500">
          #{token.tokenId}
        </div>
      )}
      <div className="space-y-0.5 p-2.5">
        <p className="truncate text-sm font-medium text-white group-hover:text-blue-300">
          {token.name}
        </p>
        <p className="flex items-center gap-1 text-xs text-slate-500">
          {token.amount && token.amount > 1 ? (
            <span>{token.amount} minted</span>
          ) : (
            <>
              <span>#{token.tokenId}</span>
              <ExternalLink className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
            </>
          )}
        </p>
      </div>
    </a>
  )
}

export function CollectionMintedGallery({ collection }: CollectionMintedGalleryProps) {
  const { ref, isInView } = useLazyInView()
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const contractAddress = collection.contract_address
  const chainId = collection.chain_id ?? 52014

  const { items, gemShardTokenIds, isGemShards, isLoading, totalCount, onChainMintedCount } =
    useCollectionMintedTokens(collection, { enabled: isInView })

  const visibleGemShardIds = useMemo(
    () => (gemShardTokenIds ?? []).slice(0, visibleCount),
    [gemShardTokenIds, visibleCount],
  )

  const gemShardsDisplayQuery = useQuery({
    queryKey: ['gem-shards-minted-display', contractAddress, visibleGemShardIds],
    enabled: Boolean(isGemShards && contractAddress && visibleGemShardIds.length > 0),
    queryFn: () => fetchGemShardsMintDisplayInfo(visibleGemShardIds),
    staleTime: MINTED_INDEX_STALE_MS,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })

  const displayedItems = useMemo((): MintedTokenInfo[] => {
    if (isGemShards) {
      return (gemShardsDisplayQuery.data ?? []).map((shard) => ({
        tokenId: shard.tokenId,
        name: shard.name,
        imageUrl: shard.imageUrl,
      }))
    }
    return items.slice(0, visibleCount)
  }, [gemShardsDisplayQuery.data, isGemShards, items, visibleCount])

  const galleryLoading = isLoading || (isGemShards && gemShardsDisplayQuery.isLoading)
  const hasMore = totalCount > visibleCount
  const showingCount = Math.min(visibleCount, totalCount)

  if (!contractAddress) return null

  if (
    isInView
    && displayedItems.length === 0
    && (galleryLoading || (totalCount === 0 && (onChainMintedCount ?? 0) > 0))
  ) {
    return null
  }

  return (
    <section ref={ref} className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Minted NFTs</h2>
        {isInView && !galleryLoading && totalCount > 0 && (
          <p className="text-sm text-slate-500">
            {hasMore ? `Showing ${showingCount} of ${totalCount}` : `${totalCount} on-chain`}
          </p>
        )}
      </div>

      {!isInView ? (
        <p className="text-sm text-slate-500">Scroll down to load minted NFTs.</p>
      ) : totalCount === 0 ? (
        <p className="text-slate-500">No NFTs have been minted from this collection yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {displayedItems.map((token) => (
              <MintedTokenCard
                key={`${token.tokenId}-${token.amount ?? 1}`}
                token={token}
                chainId={chainId}
                contractAddress={contractAddress}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                disabled={galleryLoading}
              >
                {galleryLoading ? 'Loading…' : `Load more (${totalCount - showingCount} remaining)`}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
