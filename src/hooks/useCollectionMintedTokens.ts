import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient, useReadContract, useReadContracts } from 'wagmi'
import { useCollectionTokens } from '@/hooks/useCollections'
import { usePlatformConfig } from '@/hooks/usePlatformConfig'
import {
  fetchErc721MintAssignments,
  fetchGemShardMintedTokenIds,
} from '@/lib/collection-minted-index'
import { getChainKey, getCollectionContractAbi, NFT_ABI } from '@/lib/blockchain'
import { getCollectionTokenStandard } from '@/lib/collection-contract'
import { GEM_SHARDS_ABI, isGemShardsContract } from '@/lib/gem-shards'
import { getPublicImageUrl } from '@/lib/supabase'
import type { MintedTokenInfo } from '@/components/MintSuccessModal'
import type { Collection } from '@/types/database'

const MINTED_INDEX_STALE_MS = 5 * 60_000

type UseCollectionMintedTokensOptions = {
  /** When false, no RPC or metadata requests are made. */
  enabled?: boolean
}

export function useCollectionMintedTokens(
  collection: Collection,
  options: UseCollectionMintedTokensOptions = {},
) {
  const queryEnabled = options.enabled ?? true
  const { data: platformConfig } = usePlatformConfig()
  const publicClient = usePublicClient({ chainId: collection.chain_id ?? 52014 })
  const contractAddress = collection.contract_address as `0x${string}` | undefined
  const targetChainId = collection.chain_id ?? 52014
  const networkKey = getChainKey(targetChainId)
  const tokenStandard = getCollectionTokenStandard(collection)
  const isErc1155 = tokenStandard === 'erc1155'
  const contractAbi = getCollectionContractAbi(collection)
  const isGemShards = isGemShardsContract(collection.contract_address, networkKey, {
    gem_shards_mainnet: platformConfig?.gem_shards_mainnet,
    gem_shards_testnet: platformConfig?.gem_shards_testnet,
  })

  const { data: totalMinted, isLoading: totalMintedLoading } = useReadContract({
    address: contractAddress,
    abi: isGemShards ? GEM_SHARDS_ABI : NFT_ABI,
    functionName: 'totalMinted',
    chainId: targetChainId,
    query: {
      enabled: queryEnabled && Boolean(contractAddress) && !isErc1155,
      staleTime: MINTED_INDEX_STALE_MS,
    },
  })

  const mintedCount = Number(totalMinted ?? 0)

  const { data: dbTokens = [], isLoading: dbTokensLoading } = useCollectionTokens(
    queryEnabled && contractAddress ? collection.id : undefined,
  )

  const gemShardTokenIdsQuery = useQuery({
    queryKey: ['collection-minted-gem-shards', contractAddress, targetChainId],
    enabled: queryEnabled && Boolean(isGemShards && contractAddress && publicClient),
    staleTime: MINTED_INDEX_STALE_MS,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => fetchGemShardMintedTokenIds(publicClient!, contractAddress!),
  })

  const erc721AssignmentsQuery = useQuery({
    queryKey: [
      'collection-minted-erc721',
      contractAddress,
      targetChainId,
      mintedCount,
      collection.random_public_mint,
    ],
    enabled: queryEnabled
      && Boolean(
        contractAddress
        && publicClient
        && !isErc1155
        && !isGemShards
        && mintedCount > 0,
      ),
    staleTime: MINTED_INDEX_STALE_MS,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () =>
      fetchErc721MintAssignments(
        publicClient!,
        contractAddress!,
        mintedCount,
        Boolean(collection.random_public_mint),
      ),
  })

  const editionReads = useReadContracts({
    contracts: dbTokens
      .filter((token) => token.token_id != null)
      .map((token) => ({
        address: contractAddress!,
        abi: contractAbi,
        functionName: 'editionMinted' as const,
        args: [BigInt(token.token_id!)],
        chainId: targetChainId,
      })),
    query: {
      enabled: queryEnabled && Boolean(isErc1155 && contractAddress && dbTokens.length > 0),
      staleTime: MINTED_INDEX_STALE_MS,
      refetchOnWindowFocus: false,
    },
  })

  const erc721Items = useMemo((): MintedTokenInfo[] => {
    const assignments = erc721AssignmentsQuery.data
    if (!assignments || assignments.length === 0) return []

    return assignments.map(({ onChainTokenId, metadataIndex }) => {
      const dbToken = dbTokens.find((row) => row.token_id === metadataIndex)
      return {
        tokenId: onChainTokenId,
        name: dbToken?.name?.trim() || `Token #${onChainTokenId}`,
        imageUrl: dbToken?.image_storage_path ? getPublicImageUrl(dbToken.image_storage_path) : null,
      }
    })
  }, [dbTokens, erc721AssignmentsQuery.data])

  const erc1155Items = useMemo((): MintedTokenInfo[] => {
    if (!isErc1155) return []

    return dbTokens
      .filter((token) => token.token_id != null)
      .map((token, index) => {
        const mintedResult = editionReads.data?.[index]?.result
        const amount = typeof mintedResult === 'bigint' ? Number(mintedResult) : 0
        return {
          tokenId: token.token_id!,
          name: token.name?.trim() || `Edition #${token.token_id}`,
          imageUrl: token.image_storage_path ? getPublicImageUrl(token.image_storage_path) : null,
          amount,
        }
      })
      .filter((item) => (item.amount ?? 0) > 0)
  }, [dbTokens, editionReads.data, isErc1155])

  const gemShardTokenIds = gemShardTokenIdsQuery.data ?? []

  const items = isGemShards ? [] : isErc1155 ? erc1155Items : erc721Items

  const isLoading = !queryEnabled
    ? false
    : !contractAddress
      ? false
      : isErc1155
        ? dbTokensLoading || editionReads.isLoading
        : isGemShards
          ? gemShardTokenIdsQuery.isLoading
          : totalMintedLoading || erc721AssignmentsQuery.isLoading

  const totalCount = isGemShards ? gemShardTokenIds.length : items.length

  return {
    items,
    gemShardTokenIds: isGemShards ? gemShardTokenIds : undefined,
    isGemShards,
    isLoading,
    totalCount,
  }
}
