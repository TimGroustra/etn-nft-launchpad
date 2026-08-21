import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { verifyMessage } from 'https://esm.sh/viem@2.21.0'
import { corsHeaders, normalizeWallet } from '../_shared/utils.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { walletAddress, signature, message } = await req.json()
    if (!walletAddress || !signature || !message) throw new Error('Missing parameters')

    const wallet = normalizeWallet(walletAddress)
    const valid = await verifyMessage({
      address: wallet as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    })
    if (!valid) throw new Error('Invalid signature')

    const { data: nonceRow } = await supabase
      .from('wallet_nonces')
      .select('nonce, expires_at')
      .eq('wallet_address', wallet)
      .maybeSingle()

    if (!nonceRow || new Date(nonceRow.expires_at) < new Date()) {
      throw new Error('Nonce expired')
    }
    if (!message.includes(nonceRow.nonce)) {
      throw new Error('Invalid nonce in message')
    }

    const sessionToken = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    await supabase.from('wallet_sessions').insert({
      wallet_address: wallet,
      session_token: sessionToken,
      expires_at: expiresAt.toISOString(),
    })

    await supabase.from('wallet_nonces').delete().eq('wallet_address', wallet)

    return new Response(JSON.stringify({ sessionToken, expiresAt: expiresAt.toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Auth failed'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
