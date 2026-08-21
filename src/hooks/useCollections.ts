import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Collection, CollectionToken } from '@/types/database'

export function useCollections(walletAddress?: string, chainId?: number) {
  return useQuery({
    queryKey: ['collections', walletAddress, chainId],
    queryFn: async () => {
      let query = supabase.from('collections').select('*').order('created_at', { ascending: false })
      if (walletAddress) {
        query = query.eq('creator_wallet', walletAddress.toLowerCase())
        if (chainId) query = query.eq('chain_id', chainId)
      } else {
        query = query.eq('status', 'published')
      }
      const { data, error } = await query
      if (error) throw error
      return data as Collection[]
    },
  })
}

export function useCollection(idOrAddress?: string) {
  return useQuery({
    queryKey: ['collection', idOrAddress],
    enabled: !!idOrAddress,
    queryFn: async () => {
      const isUuid = idOrAddress?.includes('-')
      const query = isUuid
        ? supabase.from('collections').select('*').eq('id', idOrAddress!).single()
        : supabase.from('collections').select('*').eq('contract_address', idOrAddress!.toLowerCase()).single()
      const { data, error } = await query
      if (error) throw error
      return data as Collection
    },
  })
}

export function useCollectionTokens(collectionId?: string) {
  return useQuery({
    queryKey: ['collection-tokens', collectionId],
    enabled: !!collectionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collection_tokens')
        .select('*')
        .eq('collection_id', collectionId!)
        .order('token_id', { ascending: true })
      if (error) throw error
      return data as CollectionToken[]
    },
  })
}
