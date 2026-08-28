import { useMemo } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { useCollectionTokens } from '@/hooks/useCollections'
import { usePlatformConfig } from '@/hooks/usePlatformConfig'
import { getChainKey, getCollectionContractAbi, NFT_ABI } from '@/lib/blockchain'
import { getCollectionTokenStandard } from '@/lib/collection-contract'
import { GEM_SHARDS_ABI, isGemShardsContract } from '@/lib/gem-shards'
import {
  buildErc1155TypeAvailability,
  sumEditionRemaining,
} from '@/lib/erc1155-mint'
import type { Collection } from '@/types/database'

export function useMintPanelAvailability(collection: Collection) {
  const { data: platformConfig } = usePlatformConfig()
  const contractAddress = collection.contract_address as `0x${string}` | undefined
  const targetChainId = collection.chain_id ?? 52014
  const networkKey = getChainKey(targetChainId)
  const tokenStandard = getCollectionTokenStandard(collection)
  const isErc1155 = tokenStandard === 'erc1155'
  const contractAbi = isErc1155 ? getCollectionContractAbi(collection) : NFT_ABI
  const isGemShards = isGemShardsContract(collection.contract_address, networkKey, {
    gem_shards_mainnet: platformConfig?.gem_shards_mainnet,
    gem_shards_testnet: platformConfig?.gem_shards_testnet,
  })

  const { data: totalMinted, isLoading: erc721Loading } = useReadContract({
    address: contractAddress,
    abi: isGemShards ? GEM_SHARDS_ABI : NFT_ABI,
    functionName: 'totalMinted',
    chainId: targetChainId,
    query: { enabled: Boolean(contractAddress) && !isErc1155 },
  })

  const { data: tokens = [], isLoading: tokensLoading } = useCollectionTokens(
    isErc1155 ? collection.id : undefined,
  )

  const editionReads = useReadContracts({
    contracts: tokens
      .filter((token) => token.token_id != null)
      .flatMap((token) => [
        {
          address: contractAddress!,
          abi: contractAbi,
          functionName: 'editionCap' as const,
          args: [BigInt(token.token_id!)],
          chainId: targetChainId,
        },
        {
          address: contractAddress!,
          abi: contractAbi,
          functionName: 'editionMinted' as const,
          args: [BigInt(token.token_id!)],
          chainId: targetChainId,
        },
      ]),
    query: { enabled: Boolean(isErc1155 && contractAddress && tokens.length > 0) },
  })

  const isLoading = isErc1155
    ? tokensLoading || editionReads.isLoading
    : erc721Loading

  const isFullyMinted = useMemo(() => {
    if (!contractAddress) return false

    if (!isErc1155) {
      return Number(totalMinted ?? 0) >= collection.max_supply
    }

    const caps = new Map<number, bigint>()
    const minted = new Map<number, bigint>()
    const sorted = tokens.filter((t) => t.token_id != null).sort((a, b) => (a.token_id ?? 0) - (b.token_id ?? 0))
    sorted.forEach((token, index) => {
      const tokenId = token.token_id!
      const capResult = editionReads.data?.[index * 2]?.result
      const mintedResult = editionReads.data?.[index * 2 + 1]?.result
      if (typeof capResult === 'bigint') caps.set(tokenId, capResult)
      if (typeof mintedResult === 'bigint') minted.set(tokenId, mintedResult)
    })

    const types = buildErc1155TypeAvailability(tokens, caps, minted)
    const listed = types.filter((type) => type.isListed)
    if (listed.length === 0) return false

    return sumEditionRemaining(types) === 0
  }, [collection.max_supply, contractAddress, editionReads.data, isErc1155, tokens, totalMinted])

  return {
    isLoading,
    isFullyMinted,
    hideFromPanel: !isLoading && isFullyMinted,
  }
}
