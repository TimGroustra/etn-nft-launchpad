import { useMemo } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import {
  GEM_SHARDS_ABI,
  PUBLISH_FEE_DISTRIBUTOR_ABI,
  resolveGemShardsAddress,
  resolvePublishFeeDistributorAddress,
} from '@/lib/gem-shards'
import { usePlatformConfig } from '@/hooks/usePlatformConfig'
import { getChainKey } from '@/lib/blockchain'
import { useNetwork } from '@/context/NetworkContext'

const MAX_SUPPLY = 495

function buildOwnerScanContracts(gemShardsAddress: `0x${string}`, chainId: number, start: number, end: number) {
  const contracts = []
  for (let tokenId = start; tokenId <= end; tokenId += 1) {
    contracts.push({
      address: gemShardsAddress,
      abi: GEM_SHARDS_ABI,
      functionName: 'ownerOf' as const,
      args: [BigInt(tokenId)],
      chainId,
    })
  }
  return contracts
}

export function useGemShardRewards() {
  const { address, isConnected } = useAccount()
  const { chain } = useNetwork()
  const networkKey = getChainKey(chain.id)
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
    },
  })

  const shouldScan = configured && Boolean(address) && (shardBalance ?? 0n) > 0n

  const ownerScanContracts = useMemo(() => {
    if (!shouldScan) return []
    return buildOwnerScanContracts(gemShardsAddress, chain.id, 1, MAX_SUPPLY)
  }, [shouldScan, gemShardsAddress, chain.id])

  const { data: ownerResults, isLoading: ownersLoading } = useReadContracts({
    contracts: ownerScanContracts,
    query: {
      enabled: shouldScan,
      staleTime: 30_000,
    },
  })

  const ownedTokenIds = useMemo(() => {
    if (!ownerResults || !address) return []
    const owned: number[] = []
    ownerResults.forEach((result, index) => {
      if (result.status === 'success' && result.result?.toLowerCase() === address.toLowerCase()) {
        owned.push(index + 1)
      }
    })
    return owned
  }, [ownerResults, address])

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
      staleTime: 15_000,
      refetchInterval: 30_000,
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

  return {
    configured,
    isConnected,
    gemShardsAddress,
    distributorAddress,
    shardBalance: shardBalance ?? 0n,
    ownedTokenIds,
    claimableTokenIds,
    totalPendingWei,
    loading: ownersLoading || pendingLoading,
  }
}
