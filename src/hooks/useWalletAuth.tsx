import { useAccount, useSignMessage } from 'wagmi'
import { useCallback, useEffect, useState } from 'react'
import { authenticateWallet, getStoredSession, requestNonce, clearSession } from '@/lib/auth'
import { Button } from '@/components/ui/button'

export function useWalletAuth() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [session, setSession] = useState(getStoredSession())
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }, [address, signMessageAsync])

  const signOut = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

  const isAuthenticated =
    isConnected &&
    !!session &&
    session.walletAddress === address?.toLowerCase() &&
    new Date(session.expiresAt) > new Date()

  return { session, isAuthenticated, signIn, signOut, loading, error, address }
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
      <Button size="sm" onClick={signIn} disabled={loading}>
        {loading ? 'Signing...' : 'Sign in'}
      </Button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}
