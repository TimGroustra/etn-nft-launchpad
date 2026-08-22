import { useAccount, useSignMessage } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authenticateWallet, getStoredSession, requestNonce, clearSession, type WalletSession } from '@/lib/auth'
import { Button } from '@/components/ui/button'

interface WalletAuthContextValue {
  session: WalletSession | null
  isAuthenticated: boolean
  signIn: () => Promise<void>
  signOut: () => void
  loading: boolean
  error: string | null
  address: string | undefined
}

const WalletAuthContext = createContext<WalletAuthContextValue | null>(null)

export function WalletAuthProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const queryClient = useQueryClient()
  const [session, setSession] = useState(getStoredSession)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSession(getStoredSession())
  }, [address])

  const signIn = useCallback(async () => {
    if (!address) return
    setLoading(true)
    setError(null)
    try {
      const { message } = await requestNonce(address)
      const signature = await signMessageAsync({ message })
      const newSession = await authenticateWallet(address, signature, message)
      setSession(newSession)
      await queryClient.invalidateQueries({ queryKey: ['collections'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }, [address, signMessageAsync, queryClient])

  const signOut = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

  const isAuthenticated =
    isConnected &&
    !!session &&
    session.walletAddress === address?.toLowerCase() &&
    new Date(session.expiresAt) > new Date()

  const value = useMemo(
    () => ({ session, isAuthenticated, signIn, signOut, loading, error, address }),
    [session, isAuthenticated, signIn, signOut, loading, error, address],
  )

  return <WalletAuthContext.Provider value={value}>{children}</WalletAuthContext.Provider>
}

export function useWalletAuth() {
  const ctx = useContext(WalletAuthContext)
  if (!ctx) throw new Error('useWalletAuth must be used within WalletAuthProvider')
  return ctx
}

export function WalletAuthButton() {
  const { isConnected } = useAccount()
  const { isAuthenticated, signIn, signOut, loading, error } = useWalletAuth()

  if (!isConnected) return null
  if (isAuthenticated) {
    return (
      <Button variant="outline" size="sm" onClick={signOut}>
        Sign out
      </Button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={() => void signIn()} disabled={loading}>
        {loading ? 'Signing...' : 'Sign in'}
      </Button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}
