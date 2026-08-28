import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { filterMintPanelCollections } from '@/lib/mint-panel'
import type { Collection, CollectionToken } from '@/types/database'

export type CollectionListFilter = 'active' | 'archived' | 'all'

export function useCollections(
  walletAddress?: string,
  chainId?: number,
  filter: CollectionListFilter = 'active',
) {
  return useQuery({
    queryKey: ['collections', walletAddress, chainId, filter],
    queryFn: async () => {
      let query = supabase.from('collections').select('*').order('created_at', { ascending: false })
      if (walletAddress) {
        const normalizedWallet = walletAddress.toLowerCase()
        query = query.ilike('creator_wallet', normalizedWallet)
        if (chainId) query = query.eq('chain_id', chainId)
        if (filter === 'active') query = query.in('status', ['draft', 'published'])
        else if (filter === 'archived') query = query.eq('status', 'archived')
      } else {
        query = query.eq('status', 'published')
      }
      const { data, error } = await query
      if (error) throw error
      return data as Collection[]
    },
  })
}

export function useArchivedCollections(walletAddress?: string, chainId?: number) {
  return useCollections(walletAddress, chainId, 'archived')
}

/** All launchpad collections not created by this wallet (treasury dashboard). */
export function useOtherCollections(walletAddress?: string, chainId?: number, enabled = false) {
  return useQuery({
    queryKey: ['collections-other', walletAddress, chainId],
    enabled: enabled && Boolean(walletAddress && chainId),
    queryFn: async () => {
      const normalizedWallet = walletAddress!.toLowerCase()
      let query = supabase
        .from('collections')
        .select('*')
        .not('creator_wallet', 'ilike', normalizedWallet)
        .order('created_at', { ascending: false })
      if (chainId) query = query.eq('chain_id', chainId)
      const { data, error } = await query
      if (error) throw error
      return data as Collection[]
    },
  })
}

export function useMintPanelCollections(chainId?: number, isAdmin = false) {
  return useQuery({
    queryKey: ['mint-panel-collections', chainId, isAdmin],
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
      return filterMintPanelCollections((data ?? []) as Collection[], isAdmin)
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
