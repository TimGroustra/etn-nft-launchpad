import { supabase } from './supabase'

export type CollectionTokenSummary = {
  token_id: number | null
  name: string
  image_storage_path: string | null
}

/** Base URI for ElectroSwap IMintable metadata: `{base}{tokenId}.json` */
export function getCollectionMetadataBaseUri(collectionId: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
  return `${supabaseUrl}/storage/v1/object/public/collection-metadata/${collectionId}/`
}

export async function listCollectionTokens(collectionId: string): Promise<CollectionTokenSummary[]> {
  const { data, error } = await supabase
    .from('collection_tokens')
    .select('token_id, name, image_storage_path')
    .eq('collection_id', collectionId)
    .order('token_id', { ascending: true })
  if (error) throw error
  return (data ?? []) as CollectionTokenSummary[]
}
