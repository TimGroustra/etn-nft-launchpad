import type { ReactNode } from 'react'
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CUSTOM_RPC_URLS, electroneum, electroneumTestnet, SUPPORTED_CHAINS, TESTNET_ENABLED } from '@/lib/blockchain'
import { http } from 'wagmi'
import { NetworkProvider } from '@/context/NetworkContext'
import { WalletAuthProvider } from '@/hooks/useWalletAuth'

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '6bf6982c9ea6494b0917646e22c1c358'

const DEFAULT_APP_URL = 'https://www.etn-nft-launchpad.club'

/** Must match the page origin for WalletConnect Verify (anti-phishing). */
function getAppUrl(): string {
  if (typeof window !== 'undefined') return window.location.origin
  const fromEnv = import.meta.env.VITE_APP_URL?.trim()
  return (fromEnv || DEFAULT_APP_URL).replace(/\/$/, '')
}

const appUrl = getAppUrl()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

const networks = [...SUPPORTED_CHAINS] as [typeof SUPPORTED_CHAINS[number], ...typeof SUPPORTED_CHAINS[number][]]

const wagmiTransports: Record<number, ReturnType<typeof http>> = {
  [electroneum.id]: http(electroneum.rpcUrls.default.http[0]),
}
if (TESTNET_ENABLED) {
  wagmiTransports[electroneumTestnet.id] = http(electroneumTestnet.rpcUrls.default.http[0])
}

const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
  customRpcUrls: CUSTOM_RPC_URLS,
  transports: wagmiTransports,
})

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: electroneum,
  customRpcUrls: CUSTOM_RPC_URLS,
  projectId,
  metadata: {
    name: 'ETN NFT Launchpad',
    description: 'Launch editable NFT collections on Electroneum',
    url: appUrl,
    icons: [`${appUrl}/vite.svg`],
  },
  features: {
    analytics: false,
    onramp: false,
    email: false,
    socials: false,
    swaps: false,
    send: false,
    receive: false,
    history: false,
  },
  themeVariables: {
    '--w3m-font-size-master': '10px',
    '--apkt-font-size-master': '10px',
  },
  enableInjected: true,
  enableEIP6963: true,
  themeMode: 'dark',
})

export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <NetworkProvider>
          <WalletAuthProvider>{children}</WalletAuthProvider>
        </NetworkProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
