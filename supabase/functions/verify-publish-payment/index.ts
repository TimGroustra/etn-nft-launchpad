import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { createPublicClient, http } from 'https://esm.sh/viem@2.21.0'
import { corsHeaders, normalizeWallet, assertValidTxHash, validateSession } from '../_shared/utils.ts'

const CHAIN_RPC: Record<number, string> = {
  52014: 'https://rpc.electroneum.com',
  5201420: 'https://rpc.ankr.com/electroneum_testnet',
}

/** 1 ETN testnet, 1000 ETN mainnet */
const DEFAULT_PUBLISH_FEE_WEI: Record<number, string> = {
  5201420: '1000000000000000000',
  52014: '1000000000000000000000',
}

function getPublishFeeWei(chainId: number): bigint {
  if (chainId === 5201420) {
    return BigInt(Deno.env.get('PUBLISH_FEE_WEI_TESTNET') ?? DEFAULT_PUBLISH_FEE_WEI[5201420])
  }
  if (chainId === 52014) {
    return BigInt(Deno.env.get('PUBLISH_FEE_WEI_MAINNET') ?? DEFAULT_PUBLISH_FEE_WEI[52014])
  }
  throw new Error('Unsupported chain')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const sessionToken = req.headers.get('x-session-token') ?? ''
    const { txHash, walletAddress, collectionId, chainId = 52014 } = await req.json()
    if (!txHash || !walletAddress || !collectionId) throw new Error('Missing parameters')

    const wallet = normalizeWallet(walletAddress)
    await validateSession(supabase, sessionToken, wallet)

    const normalizedHash = txHash.toLowerCase().trim()
    assertValidTxHash(normalizedHash)

    const rpc = CHAIN_RPC[chainId]
    if (!rpc) throw new Error('Unsupported chain')

    const { data: existing } = await supabase
      .from('publish_payments')
      .select('transaction_hash')
      .eq('transaction_hash', normalizedHash)
      .maybeSingle()
    if (existing) throw new Error('Transaction hash already used')

    const { data: collection } = await supabase
      .from('collections')
      .select('*')
      .eq('id', collectionId)
      .eq('creator_wallet', wallet)
      .maybeSingle()
    if (!collection) throw new Error('Collection not found')

    const publicClient = createPublicClient({
      chain: {
        id: chainId,
        name: chainId === 5201420 ? 'Electroneum Testnet' : 'Electroneum',
        nativeCurrency: { name: 'ETN', symbol: 'ETN', decimals: 18 },
        rpcUrls: { default: { http: [rpc] } },
      },
      transport: http(rpc),
    })

    const receipt = await publicClient.getTransactionReceipt({ hash: normalizedHash as `0x${string}` })
    if (!receipt || receipt.status !== 'success') throw new Error('Transaction failed or not found')

    const tx = await publicClient.getTransaction({ hash: normalizedHash as `0x${string}` })
    if (!tx || tx.from?.toLowerCase() !== wallet) throw new Error('Transaction sender mismatch')

    const publishFeeWei = getPublishFeeWei(chainId)
    if (tx.value < publishFeeWei) throw new Error('Insufficient ETN payment')

    await supabase.from('publish_payments').insert({
      transaction_hash: normalizedHash,
      wallet_address: wallet,
      collection_id: collectionId,
      amount_wei: tx.value.toString(),
    })

    await supabase
      .from('collections')
      .update({
        publish_tx_hash: normalizedHash,
        status: collection.contract_address ? 'published' : collection.status,
        chain_id: chainId,
      })
      .eq('id', collectionId)

    return new Response(JSON.stringify({ success: true, txHash: normalizedHash }), {
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
