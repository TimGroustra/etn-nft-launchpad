import { supabase } from './supabase'

const SESSION_KEY = 'launchpad_session'

export interface WalletSession {
  sessionToken: string
  walletAddress: string
  expiresAt: string
}

export function getStoredSession(): WalletSession | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as WalletSession
    if (new Date(session.expiresAt) < new Date()) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return session
  } catch {
    return null
  }
}

export function storeSession(session: WalletSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

export async function requestNonce(walletAddress: string) {
  const { data, error } = await supabase.functions.invoke('wallet-nonce', {
    body: { walletAddress },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as { nonce: string; message: string; expiresAt: string }
}

export async function authenticateWallet(
  walletAddress: string,
  signature: string,
  message: string,
): Promise<WalletSession> {
  const { data, error } = await supabase.functions.invoke('wallet-auth', {
    body: { walletAddress, signature, message },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)

  const session: WalletSession = {
    sessionToken: data.sessionToken,
    walletAddress: walletAddress.toLowerCase(),
    expiresAt: data.expiresAt,
  }
  storeSession(session)
  return session
}

export function getSessionHeaders(): Record<string, string> {
  const session = getStoredSession()
  return session ? { 'x-session-token': session.sessionToken } : {}
}
