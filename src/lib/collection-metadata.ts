import { supabase } from './supabase'

import { dedupeDbTokensByTokenId } from '@/lib/draft-token-rows'
import type { CollectionToken } from '@/types/database'

export type CollectionTokenSummary = {
  token_id: number | null
  name: string
  image_storage_path: string | null
}

/** Base URI for IMintable public mint metadata: `{base}{tokenId}.json` */
export function getCollectionMetadataBaseUri(collectionId: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
  return `${supabaseUrl}/storage/v1/object/public/collection-metadata/${collectionId}/`
}

/** Suffix stored on-chain — ERC721URIStorage prepends baseURI, so never pass a full URL here. */
export function getOnChainTokenUriSuffix(tokenId: number): string {
  return `${tokenId}.json`
}

export async function listCollectionTokens(collectionId: string): Promise<CollectionTokenSummary[]> {
  const { data, error } = await supabase
    .from('collection_tokens')
    .select('token_id, name, image_storage_path, updated_at, id')
    .eq('collection_id', collectionId)
    .order('token_id', { ascending: true })
  if (error) throw error
  const deduped = dedupeDbTokensByTokenId((data ?? []) as CollectionToken[])
  return deduped.map(({ token_id, name, image_storage_path }) => ({
    token_id,
    name,
    image_storage_path,
  }))
}
