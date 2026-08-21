import { parseEther } from 'viem'
import type { WriteContractParameters } from 'wagmi/actions'
import type { Collection } from '@/types/database'
import { NFT_ABI } from '@/lib/blockchain'
import { getCollectionMetadataBaseUri, listCollectionTokens } from '@/lib/collection-metadata'
import { syncTokenUri } from '@/lib/api'

type WriteContract = (
  variables: WriteContractParameters,
  options?: { onError?: (error: Error) => void; onSuccess?: (data: `0x${string}`) => void },
) => Promise<`0x${string}` | undefined>

export async function prepareCollectionMetadata(walletAddress: string, collectionId: string) {
  const tokens = await listCollectionTokens(collectionId)
  for (const token of tokens) {
    if (token.token_id == null) continue
    await syncTokenUri(walletAddress, collectionId, token.token_id)
  }
}

export async function configureElectroSwapMint(
  writeContractAsync: WriteContract,
  contractAddress: `0x${string}`,
  collection: Collection,
  chainId: number,
) {
  const baseUri = getCollectionMetadataBaseUri(collection.id)

  await writeContractAsync({
    address: contractAddress,
    abi: NFT_ABI,
    functionName: 'setBaseURI',
    args: [baseUri],
    chainId,
  })

  const mintPriceWei = parseEther(String(collection.mint_price_etn ?? 0))
  if (mintPriceWei > 0n) {
    await writeContractAsync({
      address: contractAddress,
      abi: NFT_ABI,
      functionName: 'setMintPrice',
      args: [mintPriceWei],
      chainId,
    })
    await writeContractAsync({
      address: contractAddress,
      abi: NFT_ABI,
      functionName: 'setMintable',
      args: [true],
      chainId,
    })
  }

  const maxMintPerWallet = Number(collection.max_mint_per_wallet ?? 0)
  if (maxMintPerWallet > 0) {
    await writeContractAsync({
      address: contractAddress,
      abi: NFT_ABI,
      functionName: 'setMaxMintPerWallet',
      args: [BigInt(maxMintPerWallet)],
      chainId,
    })
  }

  return baseUri
}
