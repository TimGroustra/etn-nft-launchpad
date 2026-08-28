import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, usePublicClient, useReadContract, useReadContracts } from 'wagmi'
import {
  GEM_SHARDS_ABI,
  PUBLISH_FEE_DISTRIBUTOR_ABI,
  resolveGemShardsAddress,
  resolvePublishFeeDistributorAddress,
} from '@/lib/gem-shards'
import { fetchGemShardOwnedTokenIds } from '@/lib/gem-shard-logs'
import { usePlatformConfig } from '@/hooks/usePlatformConfig'
import { getChainKey } from '@/lib/blockchain'
import { useNetwork } from '@/context/NetworkContext'

const REWARDS_STALE_MS = 60_000

export function useGemShardRewards() {
  const { address, isConnected } = useAccount()
  const { chain } = useNetwork()
  const networkKey = getChainKey(chain.id)
  const publicClient = usePublicClient({ chainId: chain.id })
  const { data: platformConfig } = usePlatformConfig()

  const gemShardsAddress = resolveGemShardsAddress(networkKey, {
    gem_shards_mainnet: platformConfig?.gem_shards_mainnet,
    gem_shards_testnet: platformConfig?.gem_shards_testnet,
  })
  const distributorAddress = resolvePublishFeeDistributorAddress(networkKey, {
    publish_fee_distributor_mainnet: platformConfig?.publish_fee_distributor_mainnet,
    publish_fee_distributor_testnet: platformConfig?.publish_fee_distributor_testnet,
  })

  const configured =
    gemShardsAddress !== '0x0000000000000000000000000000000000000000'
    && distributorAddress !== '0x0000000000000000000000000000000000000000'

  const { data: shardBalance } = useReadContract({
    address: gemShardsAddress,
    abi: GEM_SHARDS_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: chain.id,
    query: {
      enabled: configured && Boolean(address),
      staleTime: REWARDS_STALE_MS,
    },
  })

  const ownsShards = (shardBalance ?? 0n) > 0n

  const ownedTokenIdsQuery = useQuery({
    queryKey: ['gem-shard-owned', gemShardsAddress, chain.id, address],
    enabled: configured && Boolean(address && publicClient && ownsShards),
    staleTime: REWARDS_STALE_MS,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => fetchGemShardOwnedTokenIds(publicClient!, gemShardsAddress, address!),
  })

  const ownedTokenIds = ownedTokenIdsQuery.data ?? []

  const pendingContracts = useMemo(
    () =>
      ownedTokenIds.map((tokenId) => ({
        address: distributorAddress,
        abi: PUBLISH_FEE_DISTRIBUTOR_ABI,
        functionName: 'pendingReward' as const,
        args: [BigInt(tokenId)],
        chainId: chain.id,
      })),
    [ownedTokenIds, distributorAddress, chain.id],
  )

  const { data: pendingResults, isLoading: pendingLoading } = useReadContracts({
    contracts: pendingContracts,
    query: {
      enabled: pendingContracts.length > 0,
      staleTime: 30_000,
      refetchInterval: 60_000,
    },
  })

  const claimableTokenIds = useMemo(() => {
    if (!pendingResults) return []
    return ownedTokenIds.filter((_tokenId, index) => {
      const result = pendingResults[index]
      return result?.status === 'success' && (result.result ?? 0n) > 0n
    })
  }, [ownedTokenIds, pendingResults])

  const totalPendingWei = useMemo(() => {
    if (!pendingResults) return 0n
    return pendingResults.reduce((sum, result) => {
      if (result.status === 'success') return sum + (result.result ?? 0n)
      return sum
    }, 0n)
  }, [pendingResults])

  const loading = ownedTokenIdsQuery.isLoading || pendingLoading

  return {
    configured,
    isConnected,
    gemShardsAddress,
    distributorAddress,
    shardBalance: shardBalance ?? 0n,
    ownsShards,
    ownedTokenIds,
    claimableTokenIds,
    totalPendingWei,
    loading,
  }
}
