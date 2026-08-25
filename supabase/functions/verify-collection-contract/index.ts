import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders, normalizeWallet, validateSession } from '../_shared/utils.ts'
import {
  verifyCollectionOnExplorer,
} from '../_shared/contract-verification.ts'

async function getFactoryAddress(
  supabase: ReturnType<typeof createClient>,
  chainId: number,
  collection: { contract_version?: number | null; token_standard?: string | null },
): Promise<string | null> {
  const isTestnet = chainId === 5201420
  const version = collection.contract_version ?? 1
  if (version === 2) {
    const is1155 = collection.token_standard === 'erc1155'
    const keys = is1155
      ? isTestnet
        ? ['factory_address_v2_erc1155_testnet', 'factory_address_v2_testnet']
        : ['factory_address_v2_erc1155_mainnet', 'factory_address_v2_mainnet']
      : isTestnet
        ? ['factory_address_v2_erc721_testnet', 'factory_address_v2_testnet']
        : ['factory_address_v2_erc721_mainnet', 'factory_address_v2_mainnet']
    for (const key of keys) {
      const { data } = await supabase.from('platform_config').select('value').eq('key', key).maybeSingle()
      const value = data?.value?.trim()
      if (value && value !== '0x0000000000000000000000000000000000000000') return value
    }
  }

  const key = isTestnet ? 'factory_address_testnet' : 'factory_address_mainnet'
  const { data } = await supabase.from('platform_config').select('value').eq('key', key).maybeSingle()
  const value = data?.value?.trim()
  if (!value || value === '0x0000000000000000000000000000000000000000') return null
  return value
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const sessionToken = req.headers.get('x-session-token') ?? ''
    const { walletAddress, collectionId, contractAddress, chainId = 52014 } = await req.json()
    if (!walletAddress || !collectionId || !contractAddress) throw new Error('Missing parameters')

    const wallet = normalizeWallet(walletAddress)
    await validateSession(supabase, sessionToken, wallet)

    const { data: collection } = await supabase
      .from('collections')
      .select('id, creator_wallet, contract_address, chain_id, contract_version, token_standard')
      .eq('id', collectionId)
      .eq('creator_wallet', wallet)
      .maybeSingle()
    if (!collection) throw new Error('Collection not found')
    if (!collection.contract_address) throw new Error('Collection is not published on-chain')

    const address = String(contractAddress).toLowerCase()
    if (collection.contract_address.toLowerCase() !== address) {
      throw new Error('Contract address does not match collection record')
    }

    const targetChainId = Number(chainId)
    const factoryAddress = await getFactoryAddress(supabase, targetChainId, collection)
    const result = await verifyCollectionOnExplorer(targetChainId, address, factoryAddress, {
      contractVersion: collection.contract_version,
      tokenStandard: collection.token_standard,
    })

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
