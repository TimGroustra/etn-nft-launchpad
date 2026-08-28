import { supabase } from './supabase'
import { getSessionHeaders } from './auth'
import { withRetry } from './resilient-retry'
import type { Collection, CollectionToken } from '@/types/database'
import type { FunctionsError } from '@supabase/supabase-js'

export interface CollectionInput {
  name: string
  symbol: string
  description?: string
  mintMode: 'lazy' | 'batch'
  maxSupply: number
  mintBurnBps: number
  burnOnMint: boolean
  royaltyBurnBps: number
  royaltyBps: number
  mintPriceEtn?: number
  maxMintPerWallet?: number
  showOnMintPanel?: boolean
  mintPanelAdminOnly?: boolean
  randomPublicMint?: boolean
  tokenStandard?: 'erc721' | 'erc1155'
  contractVersion?: number
  storageProvider?: 'supabase'
  chainId?: number
}

function extractFunctionError(data: unknown, error: FunctionsError | null): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const message = (data as { error?: unknown }).error
    if (typeof message === 'string' && message.trim()) return message
  }
  if (error?.message) return error.message
  return 'Request failed'
}

async function invokeFunction<T = Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  return withRetry(async () => {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
      headers: getSessionHeaders(),
    })
    if (error) throw new Error(extractFunctionError(data, error))
    if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
      throw new Error(String((data as { error: string }).error))
    }
    return data as T
  }, { maxAttempts: 4 })
}
export async function createCollection(walletAddress: string, input: CollectionInput): Promise<Collection> {
  const data = await invokeFunction<{ collection: Collection }>('collection-api', {
    action: 'create_collection',
    walletAddress,
    ...input,
  })
  return data.collection
}

export async function updateCollection(
  walletAddress: string,
  collectionId: string,
  updates: Record<string, unknown>,
): Promise<Collection> {
  const data = await invokeFunction<{ collection: Collection }>('collection-api', {
    action: 'update_collection',
    walletAddress,
    collectionId,
    ...updates,
  })
  return data.collection
}

export async function deleteCollection(walletAddress: string, collectionId: string) {
  return invokeFunction('collection-api', {
    action: 'delete_collection',
    walletAddress,
    collectionId,
  })
}

export async function archiveCollection(walletAddress: string, collectionId: string): Promise<Collection> {
  const data = await invokeFunction<{ collection: Collection }>('collection-api', {
    action: 'archive_collection',
    walletAddress,
    collectionId,
  })
  return data.collection
}

export async function restoreCollection(walletAddress: string, collectionId: string): Promise<Collection> {
  const data = await invokeFunction<{ collection: Collection }>('collection-api', {
    action: 'restore_collection',
    walletAddress,
    collectionId,
  })
  return data.collection
}

export async function addToken(walletAddress: string, payload: Record<string, unknown>): Promise<CollectionToken> {
  const data = await invokeFunction<{ token: CollectionToken }>('collection-api', {
    action: 'upsert_token',
    walletAddress,
    ...payload,
  })
  return data.token
}

export async function updateToken(walletAddress: string, payload: Record<string, unknown>): Promise<CollectionToken> {
  const data = await invokeFunction<{ token: CollectionToken }>('collection-api', {
    action: 'update_token',
    walletAddress,
    ...payload,
  })
  return data.token
}

export async function deleteToken(walletAddress: string, tokenDbId: string) {
  return invokeFunction('collection-api', {
    action: 'delete_token',
    walletAddress,
    tokenId: tokenDbId,
  })
}

export async function verifyPublishPayment(
  walletAddress: string,
  collectionId: string,
  txHash: string,
  chainId: number,
) {
  return invokeFunction('verify-publish-payment', {
    walletAddress,
    collectionId,
    txHash,
    chainId,
  })
}

export async function verifyCollectionContract(
  walletAddress: string,
  collectionId: string,
  contractAddress: string,
  chainId: number,
): Promise<{
  success: boolean
  status?: string
  message?: string
  displayName?: string
  explorerName?: string
}> {
  return invokeFunction('verify-collection-contract', {
    walletAddress,
    collectionId,
    contractAddress,
    chainId,
  })
}

export async function syncTokenUri(
  walletAddress: string,
  collectionId: string,
  tokenId: number,
): Promise<{
  tokenUri: string
  onChainTokenUri?: string
  contractAddress?: string
  functionName?: string
  args?: unknown[]
  minted?: boolean
}> {
  return invokeFunction('sync-token-uri', {
    walletAddress,
    collectionId,
    tokenId,
  })
}

export async function batchUpsertTokens(
  walletAddress: string,
  payload: {
    collectionId: string
    tokens: Array<{
      tokenId: number
      name: string
      description?: string
      attributes?: unknown[]
      imageStoragePath: string
      editionSize?: number
    }>
  },
): Promise<CollectionToken[]> {
  const data = await invokeFunction<{ tokens: CollectionToken[] }>('collection-api', {
    action: 'batch_upsert_tokens',
    walletAddress,
    ...payload,
  })
  return data.tokens
}

export async function uploadImage(
  walletAddress: string,
  collectionId: string,
  tokenId: number,
  file: File,
): Promise<string> {
  const contentType = file.type || 'image/png'
  const prepared = await invokeFunction<{ path: string; signedUrl: string }>('collection-api', {
    action: 'prepare_image_upload',
    walletAddress,
    collectionId,
    tokenId,
    contentType,
  })

  const uploadResponse = await withRetry(
    () =>
      fetch(prepared.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      }),
    { maxAttempts: 5 },
  )
  if (!uploadResponse.ok) {
    throw new Error(`Image upload failed (${uploadResponse.status}). Try a smaller file or different format.`)
  }

  return prepared.path
}
export async function publishGemShards(walletAddress: string, network: 'mainnet' | 'testnet') {
  return invokeFunction<{ status: string; network: string }>('gem-shards-api', {
    action: 'publish_gem_shards',
    walletAddress,
    network,
  })
}
