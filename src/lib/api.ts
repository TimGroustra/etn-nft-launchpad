import { supabase } from './supabase'
import { getSessionHeaders } from './auth'

export interface CollectionInput {
  name: string
  symbol: string
  description?: string
  mintMode: 'lazy' | 'batch'
  maxSupply: number
  clubBurnAmount: number
  burnOnMint: boolean
  burnOnResale: boolean
  storageProvider?: 'supabase'
  chainId?: number
}

export async function createCollection(walletAddress: string, input: CollectionInput) {
  const { data, error } = await supabase.functions.invoke('collection-api', {
    body: { action: 'create_collection', walletAddress, ...input },
    headers: getSessionHeaders(),
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.collection
}

export async function updateCollection(walletAddress: string, collectionId: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('collection-api', {
    body: { action: 'update_collection', walletAddress, collectionId, ...updates },
    headers: getSessionHeaders(),
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.collection
}

export async function addToken(walletAddress: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('collection-api', {
    body: { action: 'add_token', walletAddress, ...payload },
    headers: getSessionHeaders(),
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.token
}

export async function updateToken(walletAddress: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('collection-api', {
    body: { action: 'update_token', walletAddress, ...payload },
    headers: getSessionHeaders(),
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.token
}

export async function verifyPublishPayment(
  walletAddress: string,
  collectionId: string,
  txHash: string,
  chainId: number,
) {
  const { data, error } = await supabase.functions.invoke('verify-publish-payment', {
    body: { walletAddress, collectionId, txHash, chainId },
    headers: getSessionHeaders(),
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function syncTokenUri(walletAddress: string, collectionId: string, tokenId: number) {
  const { data, error } = await supabase.functions.invoke('sync-token-uri', {
    body: { walletAddress, collectionId, tokenId },
    headers: getSessionHeaders(),
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function uploadImage(collectionId: string, tokenId: number, file: File) {
  const path = `${collectionId}/${tokenId}.png`
  const { error } = await supabase.storage
    .from('collection-images')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  return path
}
