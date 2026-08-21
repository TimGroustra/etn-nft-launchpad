import type { ReactNode } from 'react'
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SUPPORTED_CHAINS } from '@/lib/blockchain'
import { NetworkProvider } from '@/context/NetworkContext'

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '6bf6982c9ea6494b0917646e22c1c358'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

const networks = [...SUPPORTED_CHAINS] as [typeof SUPPORTED_CHAINS[number], ...typeof SUPPORTED_CHAINS[number][]]

const wagmiAdapter = new WagmiAdapter({ projectId, networks })

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata: {
    name: 'ETN NFT Launchpad',
    description: 'Launch editable NFT collections on Electroneum',
    url: 'https://launchpad.electroneum.com',
    icons: ['https://electroneum.com/favicon.ico'],
  },
  features: { analytics: false, onramp: false, email: false, socials: false },
  enableInjected: true,
  enableEIP6963: true,
  themeMode: 'dark',
})

export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <NetworkProvider>{children}</NetworkProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
