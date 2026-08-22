export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
}

export function normalizeWallet(wallet: string): string {
  return wallet.toLowerCase().trim()
}

export function normalizeContractAddress(address: string): string {
  const normalized = address.toLowerCase().trim()
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    throw new Error('Invalid contract address')
  }
  return normalized
}

export function assertValidTxHash(hash: string) {
  if (!/^0x[a-f0-9]{64}$/.test(hash)) {
    throw new Error('Invalid transaction hash format')
  }
}

export async function validateSession(
  supabase: ReturnType<typeof import('https://esm.sh/@supabase/supabase-js@2.45.0').createClient>,
  sessionToken: string,
  walletAddress: string,
) {
  const { data, error } = await supabase
    .from('wallet_sessions')
    .select('wallet_address, expires_at')
    .eq('session_token', sessionToken)
    .maybeSingle()

  if (error || !data) throw new Error('Invalid session')
  if (new Date(data.expires_at) < new Date()) throw new Error('Session expired')
  if (normalizeWallet(data.wallet_address) !== normalizeWallet(walletAddress)) {
    throw new Error('Session wallet mismatch')
  }
}

export function createRpcClient() {
  const { createPublicClient, http } = require('https://esm.sh/viem@2.21.0')
  return createPublicClient({
    chain: {
      id: 52014,
      name: 'Electroneum',
      nativeCurrency: { name: 'ETN', symbol: 'ETN', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc.electroneum.com'] } },
    },
    transport: http('https://rpc.electroneum.com'),
  })
}
