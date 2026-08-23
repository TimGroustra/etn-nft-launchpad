import { parseEther } from 'viem'
import type { WriteContractParameters } from 'wagmi/actions'
import type { Collection } from '@/types/database'
import { NFT_ABI } from '@/lib/blockchain'
import { getCollectionMetadataBaseUri, getOnChainTokenUriSuffix, listCollectionTokens } from '@/lib/collection-metadata'
import { analyzeCollectionTokenCoverage } from '@/lib/collection-token-readiness'
import { syncTokenUri, updateToken } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { dedupeDbTokensByTokenId } from '@/lib/draft-token-rows'
import type { CollectionToken } from '@/types/database'

const BATCH_MINT_CHUNK_SIZE = 50

type WriteContract = (
  variables: WriteContractParameters,
  options?: { onError?: (error: Error) => void; onSuccess?: (data: `0x${string}`) => void },
) => Promise<`0x${string}` | undefined>

export async function prepareCollectionMetadata(
  walletAddress: string,
  collectionId: string,
  maxSupply: number,
  onProgress?: (completed: number, total: number) => void,
) {
  const tokens = await listCollectionTokens(collectionId)
  const analysis = analyzeCollectionTokenCoverage(maxSupply, tokens)
  if (analysis.readyCount < maxSupply) {
    throw new Error(
      `Cannot prepare metadata: only ${analysis.readyCount} of ${maxSupply} tokens are ready. Re-open the draft, bulk upload again, save, then publish.`,
    )
  }

  for (let tokenId = 1; tokenId <= maxSupply; tokenId++) {
    await syncTokenUri(walletAddress, collectionId, tokenId)
    onProgress?.(tokenId, maxSupply)
  }
}

export async function syncPublishedCollection(
  walletAddress: string,
  collection: Collection,
  writeContractAsync: WriteContract,
  chainId: number,
) {
  await prepareCollectionMetadata(walletAddress, collection.id, collection.max_supply)

  if (!collection.contract_address) {
    throw new Error('Collection is not published on-chain yet.')
  }

  if (collection.mint_mode === 'batch') {
    await publishBatchCollection(
      walletAddress,
      collection,
      writeContractAsync,
      chainId,
      collection.contract_address as `0x${string}`,
    )
    return
  }

  await configurePublicMint(
    writeContractAsync,
    collection.contract_address as `0x${string}`,
    collection,
    chainId,
  )
}

export async function configureCollectionBaseUri(
  writeContractAsync: WriteContract,
  contractAddress: `0x${string}`,
  collectionId: string,
  chainId: number,
  options?: { onWalletStep?: (label: string) => void },
) {
  const baseUri = getCollectionMetadataBaseUri(collectionId)

  options?.onWalletStep?.('Set on-chain metadata base URI')
  await writeContractAsync({
    address: contractAddress,
    abi: NFT_ABI,
    functionName: 'setBaseURI',
    args: [baseUri],
    chainId,
  })

  return baseUri
}

export async function batchMintCollectionToCreator(
  writeContractAsync: WriteContract,
  contractAddress: `0x${string}`,
  creatorAddress: `0x${string}`,
  maxSupply: number,
  chainId: number,
  options?: {
    onWalletStep?: (label: string) => void
    onProgress?: (completed: number, total: number) => void
  },
) {
  let lastTxHash: `0x${string}` | undefined

  for (let start = 1; start <= maxSupply; start += BATCH_MINT_CHUNK_SIZE) {
    const end = Math.min(start + BATCH_MINT_CHUNK_SIZE - 1, maxSupply)
    const count = end - start + 1
    const recipients = Array.from({ length: count }, () => creatorAddress)
    const uris = Array.from({ length: count }, (_, index) => getOnChainTokenUriSuffix(start + index))

    options?.onWalletStep?.(`Batch mint tokens ${start}–${end} of ${maxSupply}`)
    lastTxHash = await writeContractAsync({
      address: contractAddress,
      abi: NFT_ABI,
      functionName: 'batchMint',
      args: [recipients, uris],
      chainId,
    })
    options?.onProgress?.(end, maxSupply)
  }

  return lastTxHash
}

async function listCollectionTokenRecords(collectionId: string): Promise<CollectionToken[]> {
  const { data, error } = await supabase
    .from('collection_tokens')
    .select('id, token_id, name, image_storage_path, minted, updated_at')
    .eq('collection_id', collectionId)
    .order('token_id', { ascending: true })
  if (error) throw error
  return dedupeDbTokensByTokenId((data ?? []) as CollectionToken[])
}

async function markCollectionTokensMinted(
  walletAddress: string,
  collectionId: string,
  mintTxHash?: `0x${string}`,
) {
  const tokens = await listCollectionTokenRecords(collectionId)
  await Promise.all(
    tokens
      .filter((token) => token.token_id != null && !token.minted)
      .map((token) =>
        updateToken(walletAddress, {
          tokenId: token.id,
          minted: true,
          mintTxHash: mintTxHash ?? null,
        }),
      ),
  )
}

export async function publishBatchCollection(
  walletAddress: string,
  collection: Collection,
  writeContractAsync: WriteContract,
  chainId: number,
  contractAddress: `0x${string}`,
  options?: {
    onWalletStep?: (label: string) => void
    onProgress?: (completed: number, total: number) => void
  },
) {
  const baseUri = await configureCollectionBaseUri(
    writeContractAsync,
    contractAddress,
    collection.id,
    chainId,
    options,
  )

  const mintTxHash = await batchMintCollectionToCreator(
    writeContractAsync,
    contractAddress,
    walletAddress as `0x${string}`,
    collection.max_supply,
    chainId,
    options,
  )

  await markCollectionTokensMinted(walletAddress, collection.id, mintTxHash)

  return baseUri
}

export async function configurePublicMint(
  writeContractAsync: WriteContract,
  contractAddress: `0x${string}`,
  collection: Collection,
  chainId: number,
  options?: { onWalletStep?: (label: string) => void },
) {
  const baseUri = getCollectionMetadataBaseUri(collection.id)

  options?.onWalletStep?.('Set on-chain metadata base URI')
  await writeContractAsync({
    address: contractAddress,
    abi: NFT_ABI,
    functionName: 'setBaseURI',
    args: [baseUri],
    chainId,
  })

  const mintPriceWei = parseEther(String(collection.mint_price_etn ?? 0))
  if (mintPriceWei > 0n) {
    if (collection.random_public_mint) {
      options?.onWalletStep?.('Enable random mint order')
      await writeContractAsync({
        address: contractAddress,
        abi: NFT_ABI,
        functionName: 'setRandomPublicMint',
        args: [true],
        chainId,
      })
    }
    options?.onWalletStep?.('Set public mint price')
    await writeContractAsync({
      address: contractAddress,
      abi: NFT_ABI,
      functionName: 'setMintPrice',
      args: [mintPriceWei],
      chainId,
    })
    options?.onWalletStep?.('Enable public minting')
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
    options?.onWalletStep?.('Set per-wallet mint limit')
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

export async function configureCollectionRoyalty(
  writeContractAsync: WriteContract,
  contractAddress: `0x${string}`,
  royaltyBps: number,
  chainId: number,
  options?: { onWalletStep?: (label: string) => void },
) {
  const bps = Math.min(10_000, Math.max(0, Math.round(royaltyBps)))
  options?.onWalletStep?.('Set marketplace royalty (EIP-2981)')
  await writeContractAsync({
    address: contractAddress,
    abi: NFT_ABI,
    functionName: 'setDefaultRoyalty',
    args: [contractAddress, BigInt(bps)],
    chainId,
  })
}

export async function configureCollectionBurnConfig(
  writeContractAsync: WriteContract,
  contractAddress: `0x${string}`,
  collection: Collection,
  chainId: number,
  royaltyBurnBps?: number,
) {
  await writeContractAsync({
    address: contractAddress,
    abi: NFT_ABI,
    functionName: 'setBurnConfig',
    args: [
      {
        mintBurnBps: BigInt(collection.mint_burn_bps ?? 0),
        burnOnMint: Boolean(collection.burn_on_mint),
        royaltyBurnBps: BigInt(
          royaltyBurnBps ?? collection.royalty_burn_bps ?? 0,
        ),
      },
    ],
    chainId,
  })
}

/** On-chain royalty + burn config, then refresh JSON metadata for every token. */
export async function applyCollectionRoyalties(
  walletAddress: string,
  collection: Collection,
  writeContractAsync: WriteContract,
  chainId: number,
  royaltyBps: number,
  royaltyBurnBps: number,
  options?: {
    onStep?: (step: 'royalty' | 'burnConfig' | 'metadata') => void
  },
) {
  if (!collection.contract_address) {
    throw new Error('Collection is not published on-chain yet.')
  }

  const contractAddress = collection.contract_address as `0x${string}`
  options?.onStep?.('royalty')
  await configureCollectionRoyalty(writeContractAsync, contractAddress, royaltyBps, chainId)
  options?.onStep?.('burnConfig')
  await configureCollectionBurnConfig(
    writeContractAsync,
    contractAddress,
    collection,
    chainId,
    royaltyBurnBps,
  )
  options?.onStep?.('metadata')
  await prepareCollectionMetadata(walletAddress, collection.id, collection.max_supply)
}
