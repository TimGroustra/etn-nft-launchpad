import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import {
  electroneum,
  electroneumTestnet,
  getChainByKey,
  getChainKey,
  isTreasuryWallet,
  type NetworkKey,
} from '@/lib/blockchain'

const STORAGE_KEY = 'launchpad_network'

interface NetworkContextValue {
  network: NetworkKey
  chain: typeof electroneum | typeof electroneumTestnet
  isMainnet: boolean
  canSwitchNetwork: boolean
  setNetwork: (network: NetworkKey) => Promise<void>
  switching: boolean
}

const NetworkContext = createContext<NetworkContextValue | null>(null)

function readStoredNetwork(allowTestnet: boolean): NetworkKey {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'testnet' && allowTestnet) return 'testnet'
  return 'mainnet'
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChainAsync, isPending } = useSwitchChain()
  const canSwitchNetwork = isTreasuryWallet(address)
  const [network, setNetworkState] = useState<NetworkKey>(() => readStoredNetwork(false))

  const chain = useMemo(() => getChainByKey(network), [network])

  useEffect(() => {
    if (!canSwitchNetwork) {
      setNetworkState('mainnet')
      localStorage.setItem(STORAGE_KEY, 'mainnet')
      if (isConnected && chainId === electroneumTestnet.id) {
        switchChainAsync({ chainId: electroneum.id }).catch(() => undefined)
      }
      return
    }

    if (isConnected && chainId) {
      const walletNetwork = getChainKey(chainId)
      setNetworkState(walletNetwork)
      localStorage.setItem(STORAGE_KEY, walletNetwork)
      return
    }

    setNetworkState(readStoredNetwork(true))
  }, [canSwitchNetwork, chainId, isConnected, switchChainAsync])

  const setNetwork = useCallback(
    async (next: NetworkKey) => {
      if (!canSwitchNetwork && next === 'testnet') return
      setNetworkState(next)
      localStorage.setItem(STORAGE_KEY, next)
      if (isConnected) {
        await switchChainAsync({ chainId: getChainByKey(next).id })
      }
    },
    [canSwitchNetwork, isConnected, switchChainAsync],
  )

  return (
    <NetworkContext.Provider
      value={{
        network,
        chain,
        isMainnet: network === 'mainnet',
        canSwitchNetwork,
        setNetwork,
        switching: isPending,
      }}
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
