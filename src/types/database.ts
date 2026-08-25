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
    }
  }
}

export type Collection = Database['public']['Tables']['collections']['Row']
export type CollectionToken = Database['public']['Tables']['collection_tokens']['Row']
