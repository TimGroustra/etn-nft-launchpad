import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders, normalizeWallet } from '../_shared/utils.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { walletAddress } = await req.json()
    if (!walletAddress) throw new Error('Missing wallet address')

    const wallet = normalizeWallet(walletAddress)
    const nonce = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 10)

    await supabase.from('wallet_nonces').upsert({
      wallet_address: wallet,
      nonce,
      expires_at: expiresAt.toISOString(),
    })

    const message = `Sign in to ETN NFT Launchpad\nWallet: ${wallet}\nNonce: ${nonce}`

    return new Response(JSON.stringify({ nonce, message, expiresAt: expiresAt.toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nonce request failed'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
