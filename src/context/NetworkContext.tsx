import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import {
  electroneum,
  electroneumTestnet,
  getChainByKey,
  getChainKey,
  type NetworkKey,
} from '@/lib/blockchain'

const STORAGE_KEY = 'launchpad_network'

interface NetworkContextValue {
  network: NetworkKey
  chain: typeof electroneum | typeof electroneumTestnet
  isMainnet: boolean
  setNetwork: (network: NetworkKey) => Promise<void>
  switching: boolean
}

const NetworkContext = createContext<NetworkContextValue | null>(null)

function readStoredNetwork(): NetworkKey {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'testnet' ? 'testnet' : 'mainnet'
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const { chainId, isConnected } = useAccount()
  const { switchChainAsync, isPending } = useSwitchChain()
  const [network, setNetworkState] = useState<NetworkKey>(readStoredNetwork)

  const chain = useMemo(() => getChainByKey(network), [network])

  useEffect(() => {
    if (isConnected && chainId && getChainKey(chainId) !== network) {
      setNetworkState(getChainKey(chainId))
      localStorage.setItem(STORAGE_KEY, getChainKey(chainId))
    }
  }, [chainId, isConnected, network])

  const setNetwork = useCallback(
    async (next: NetworkKey) => {
      setNetworkState(next)
      localStorage.setItem(STORAGE_KEY, next)
      if (isConnected) {
        await switchChainAsync({ chainId: getChainByKey(next).id })
      }
    },
    [isConnected, switchChainAsync],
  )

  return (
    <NetworkContext.Provider
      value={{ network, chain, isMainnet: network === 'mainnet', setNetwork, switching: isPending }}
    >
      {children}
    </NetworkContext.Provider>
  )
}

export function useNetwork() {
  const ctx = useContext(NetworkContext)
  if (!ctx) throw new Error('useNetwork must be used within NetworkProvider')
  return ctx
}
