/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_FACTORY_ADDRESS: string
  readonly VITE_FACTORY_ADDRESS_MAINNET: string
  readonly VITE_FACTORY_ADDRESS_TESTNET: string
  readonly VITE_PUBLISH_FEE_WEI: string
  readonly VITE_PUBLISH_FEE_WEI_MAINNET: string
  readonly VITE_PUBLISH_FEE_WEI_TESTNET: string
  readonly VITE_WALLETCONNECT_PROJECT_ID: string
  readonly VITE_APP_URL: string
  readonly VITE_TREASURY_ADDRESS: string
  readonly VITE_ADMIN_WALLETS: string
  readonly VITE_ELECTROGEMS_NFT_ADDRESS: string
  readonly VITE_CLUB_WATCH_NFT_ADDRESS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.css' {}
