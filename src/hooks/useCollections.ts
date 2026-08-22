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

export function useMintPanelCollections(chainId?: number) {
  return useQuery({
    queryKey: ['mint-panel-collections', chainId],
    queryFn: async () => {
      let query = supabase
        .from('collections')
        .select('*')
        .eq('status', 'published')
        .eq('show_on_mint_panel', true)
        .not('contract_address', 'is', null)
        .gt('mint_price_etn', 0)
        .order('created_at', { ascending: false })
      if (chainId) query = query.eq('chain_id', chainId)
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
        ? supabase.from('collections').select('*').eq('id', idOrAddress!).maybeSingle()
        : supabase
            .from('collections')
            .select('*')
            .ilike('contract_address', idOrAddress!.toLowerCase())
            .maybeSingle()
      const { data, error } = await query
      if (error) throw error
      return (data as Collection | null) ?? null
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
