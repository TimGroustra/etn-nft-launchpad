export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      collections: {
        Row: {
          id: string
          creator_wallet: string
          name: string
          symbol: string
          description: string | null
          contract_address: string | null
          status: 'draft' | 'published' | 'archived'
          mint_mode: 'lazy' | 'batch'
          max_supply: number
          mint_burn_bps: number
          club_burn_amount: number
          burn_on_mint: boolean
          royalty_burn_bps: number
          royalty_bps: number
          mint_price_etn: number
          max_mint_per_wallet: number
          show_on_mint_panel: boolean
          mint_panel_admin_only: boolean
          minted_out: boolean
          random_public_mint: boolean
          token_standard: 'erc721' | 'erc1155'
          contract_version: number
          storage_provider: 'supabase'
          base_uri: string | null
          publish_tx_hash: string | null
          chain_id: number | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['collections']['Row']> & {
          creator_wallet: string
          name: string
          symbol: string
        }
        Update: Partial<Database['public']['Tables']['collections']['Row']>
      }
      collection_tokens: {
        Row: {
          id: string
          collection_id: string
          token_id: number | null
          name: string
          description: string | null
          attributes: Json
          image_storage_path: string | null
          metadata_storage_path: string | null
          token_uri: string | null
          minted: boolean
          mint_tx_hash: string | null
          edition_size: number
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['collection_tokens']['Row']> & {
          collection_id: string
          name: string
        }
        Update: Partial<Database['public']['Tables']['collection_tokens']['Row']>
      }
      platform_config: {
        Row: {
          key: string
          value: string
          updated_at: string
        }
        Insert: { key: string; value?: string }
        Update: Partial<Database['public']['Tables']['platform_config']['Row']>
      }
      gallery_config: {
        Row: {
          panel_key: string
          collection_name: string | null
          contract_address: string | null
          default_token_id: number | null
          show_collection: boolean | null
          wall_color: string | null
          text_color: string | null
          updated_at: string | null
          updated_by_address: string | null
        }
        Insert: Partial<Database['public']['Tables']['gallery_config']['Row']> & { panel_key: string }
        Update: Partial<Database['public']['Tables']['gallery_config']['Row']>
      }
      panel_locks: {
        Row: {
          panel_id: string
          contract_address: string | null
          token_id: string | null
          locked_by_address: string
          locked_until: string
          locking_gem_token_id: string | null
        }
        Insert: Partial<Database['public']['Tables']['panel_locks']['Row']> & {
          panel_id: string
          locked_by_address: string
          locked_until: string
        }
        Update: Partial<Database['public']['Tables']['panel_locks']['Row']>
      }
      gallery_media_cache: {
        Row: {
          contract_address: string
          token_id: number
          title: string | null
          content_type: string
          storage_path: string
          source_url: string | null
          cached_at: string
        }
        Insert: Partial<Database['public']['Tables']['gallery_media_cache']['Row']> & {
          contract_address: string
          token_id: number
          content_type: string
          storage_path: string
        }
        Update: Partial<Database['public']['Tables']['gallery_media_cache']['Row']>
      }
      gallery_cache_queue: {
        Row: {
          id: number
          contract_address: string
          token_id: number
          status: 'pending' | 'processing' | 'done' | 'failed'
          attempts: number
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['gallery_cache_queue']['Row']> & {
          contract_address: string
          token_id: number
        }
        Update: Partial<Database['public']['Tables']['gallery_cache_queue']['Row']>
      }
    }
  }
}

export type Collection = Database['public']['Tables']['collections']['Row']
export type CollectionToken = Database['public']['Tables']['collection_tokens']['Row']
