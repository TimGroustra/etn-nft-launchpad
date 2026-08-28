import { useMemo } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { ELECTROGEMS_NFT_ADDRESS, ERC721_BALANCE_ABI } from '@/lib/creator-access'
import { CREATOR_ACCESS_CHAIN_ID } from '@/lib/creator-access'
import { ELECTROGEM_FREE_MINT_SUPPLY, GEM_SHARDS_ABI, resolveGemShardsAddress } from '@/lib/gem-shards'
import { usePlatformConfig } from '@/hooks/usePlatformConfig'
import { getChainKey } from '@/lib/blockchain'
import { useNetwork } from '@/context/NetworkContext'

const ERC721_OWNER_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export function useElectroGemFreeMints() {
  const { address } = useAccount()
  const { chain } = useNetwork()
  const networkKey = getChainKey(chain.id)
  const { data: platformConfig } = usePlatformConfig()
  const gemShardsAddress = resolveGemShardsAddress(networkKey, {
    gem_shards_mainnet: platformConfig?.gem_shards_mainnet,
    gem_shards_testnet: platformConfig?.gem_shards_testnet,
  })

  const tokenIds = useMemo(
    () => Array.from({ length: ELECTROGEM_FREE_MINT_SUPPLY }, (_, index) => index + 1),
    [],
  )

  const ownerContracts = useMemo(
    () =>
      tokenIds.map((tokenId) => ({
        address: ELECTROGEMS_NFT_ADDRESS,
        abi: ERC721_OWNER_ABI,
        functionName: 'ownerOf' as const,
        args: [BigInt(tokenId)],
        chainId: CREATOR_ACCESS_CHAIN_ID,
      })),
    [tokenIds],
  )

  const claimedContracts = useMemo(
    () =>
      tokenIds.map((tokenId) => ({
        address: gemShardsAddress,
        abi: GEM_SHARDS_ABI,
        functionName: 'electroGemFreeMintClaimed' as const,
        args: [BigInt(tokenId)],
        chainId: chain.id,
      })),
    [tokenIds, gemShardsAddress, chain.id],
  )

  const { data: ownerResults, isLoading: ownersLoading } = useReadContracts({
    contracts: ownerContracts,
    query: { enabled: Boolean(address), staleTime: 30_000 },
  })

  const { data: claimedResults, isLoading: claimedLoading } = useReadContracts({
    contracts: claimedContracts,
    query: {
      enabled: Boolean(address) && gemShardsAddress !== '0x0000000000000000000000000000000000000000',
      staleTime: 30_000,
    },
  })

  const eligibleTokenIds = useMemo(() => {
    if (!address || !ownerResults || !claimedResults) return []
    return tokenIds.filter((_tokenId, index) => {
      const ownerResult = ownerResults[index]
      const claimedResult = claimedResults[index]
      return (
        ownerResult?.status === 'success'
        && ownerResult.result?.toLowerCase() === address.toLowerCase()
        && claimedResult?.status === 'success'
        && claimedResult.result === false
      )
    })
  }, [address, ownerResults, claimedResults, tokenIds])

  const { data: electroGemBalance } = useReadContract({
    address: ELECTROGEMS_NFT_ADDRESS,
    abi: ERC721_BALANCE_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CREATOR_ACCESS_CHAIN_ID,
    query: { enabled: Boolean(address) },
  })

  return {
    eligibleTokenIds,
    ownsElectroGem: (electroGemBalance ?? 0n) > 0n,
    loading: ownersLoading || claimedLoading,
  }
}
