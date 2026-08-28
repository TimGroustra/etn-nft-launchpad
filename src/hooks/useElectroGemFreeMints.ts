import { useMemo } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import {
  CREATOR_ACCESS_CHAIN_ID,
  ELECTROGEMS_NFT_ADDRESS,
  ERC721_ENUMERABLE_ABI,
} from '@/lib/creator-access'
import { ELECTROGEM_FREE_MINT_SUPPLY, GEM_SHARDS_ABI, resolveGemShardsAddress } from '@/lib/gem-shards'
import { usePlatformConfig } from '@/hooks/usePlatformConfig'
import { getChainId, getChainKey } from '@/lib/blockchain'
import { useNetwork } from '@/context/NetworkContext'

export function useElectroGemFreeMints() {
  const { address } = useAccount()
  const { chain } = useNetwork()
  const networkKey = getChainKey(chain.id)
  const gemShardsChainId = getChainId(networkKey)
  const { data: platformConfig } = usePlatformConfig()
  const gemShardsAddress = resolveGemShardsAddress(networkKey, {
    gem_shards_mainnet: platformConfig?.gem_shards_mainnet,
    gem_shards_testnet: platformConfig?.gem_shards_testnet,
  })

  const { data: electroGemBalance, isLoading: balanceLoading } = useReadContract({
    address: ELECTROGEMS_NFT_ADDRESS,
    abi: ERC721_ENUMERABLE_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CREATOR_ACCESS_CHAIN_ID,
    query: { enabled: Boolean(address), staleTime: 30_000 },
  })

  const ownedIndexCount = Number(electroGemBalance ?? 0n)
  const ownedTokenContracts = useMemo(
    () =>
      !address || ownedIndexCount === 0
        ? []
        : Array.from({ length: ownedIndexCount }, (_, index) => ({
            address: ELECTROGEMS_NFT_ADDRESS,
            abi: ERC721_ENUMERABLE_ABI,
            functionName: 'tokenOfOwnerByIndex' as const,
            args: [address, BigInt(index)] as const,
            chainId: CREATOR_ACCESS_CHAIN_ID,
          })),
    [address, ownedIndexCount],
  )

  const { data: ownedTokenResults, isLoading: ownedTokensLoading } = useReadContracts({
    contracts: ownedTokenContracts,
    query: {
      enabled: Boolean(address) && ownedIndexCount > 0,
      staleTime: 30_000,
    },
  })

  const ownedElectroGemIdsInFreeRange = useMemo(() => {
    if (!ownedTokenResults) return []
    return ownedTokenResults
      .filter((result) => result.status === 'success')
      .map((result) => Number(result.result))
      .filter((tokenId) => tokenId >= 1 && tokenId <= ELECTROGEM_FREE_MINT_SUPPLY)
  }, [ownedTokenResults])

  const claimedContracts = useMemo(
    () =>
      ownedElectroGemIdsInFreeRange.map((tokenId) => ({
        address: gemShardsAddress,
        abi: GEM_SHARDS_ABI,
        functionName: 'electroGemFreeMintClaimed' as const,
        args: [BigInt(tokenId)] as const,
        chainId: gemShardsChainId,
      })),
    [ownedElectroGemIdsInFreeRange, gemShardsAddress, gemShardsChainId],
  )

  const { data: claimedResults, isLoading: claimedLoading } = useReadContracts({
    contracts: claimedContracts,
    query: {
      enabled:
        Boolean(address)
        && gemShardsAddress !== '0x0000000000000000000000000000000000000000'
        && ownedElectroGemIdsInFreeRange.length > 0,
      staleTime: 30_000,
    },
  })

  const eligibleTokenIds = useMemo(() => {
    if (!claimedResults || ownedElectroGemIdsInFreeRange.length === 0) return []
    return ownedElectroGemIdsInFreeRange.filter((_tokenId, index) => {
      const claimedResult = claimedResults[index]
      return claimedResult?.status === 'success' && claimedResult.result === false
    })
  }, [claimedResults, ownedElectroGemIdsInFreeRange])

  return {
    eligibleTokenIds,
    ownsElectroGem: (electroGemBalance ?? 0n) > 0n,
    loading: balanceLoading || ownedTokensLoading || claimedLoading,
  }
}
