import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders, validateSession, normalizeWallet } from '../_shared/utils.ts'
import { isAdminWallet } from '../_shared/admin.ts'

type NetworkKey = 'mainnet' | 'testnet'

function resolveStatusKey(network: NetworkKey): string {
  return network === 'mainnet' ? 'gem_shards_status_mainnet' : 'gem_shards_status_testnet'
}

function resolveGemShardsAddressKey(network: NetworkKey): string {
  return network === 'mainnet' ? 'gem_shards_mainnet' : 'gem_shards_testnet'
}

function resolveChainId(network: NetworkKey): number {
  return network === 'mainnet' ? 52014 : 5201420
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const sessionToken = req.headers.get('x-session-token') ?? ''
    const body = await req.json()
    const wallet = normalizeWallet(body.walletAddress)
    await validateSession(supabase, sessionToken, wallet)

    if (body.action === 'publish_gem_shards') {
      if (!isAdminWallet(wallet)) {
        throw new Error('Only admins can publish Gem Shards.')
      }

      const network = body.network === 'testnet' ? 'testnet' : 'mainnet'
      const statusKey = resolveStatusKey(network)
      const addressKey = resolveGemShardsAddressKey(network)
      const chainId = resolveChainId(network)

      const { data: addressRow, error: addressError } = await supabase
        .from('platform_config')
        .select('value')
        .eq('key', addressKey)
        .maybeSingle()

      if (addressError) throw addressError

      const gemShardsAddress = addressRow?.value?.toLowerCase()
      if (!gemShardsAddress || gemShardsAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('Gem Shards contract address is not configured for this network.')
      }

      const { error } = await supabase
        .from('platform_config')
        .upsert({ key: statusKey, value: 'published' }, { onConflict: 'key' })

      if (error) throw error

      const { error: collectionError } = await supabase
        .from('collections')
        .update({
          status: 'published',
          show_on_mint_panel: true,
          contract_address: gemShardsAddress,
        })
        .eq('symbol', 'GSHARD')
        .eq('chain_id', chainId)

      if (collectionError) throw collectionError

      return new Response(JSON.stringify({ status: 'published', network }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Unknown action')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
