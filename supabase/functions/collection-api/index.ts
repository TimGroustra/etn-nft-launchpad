import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders, validateSession, normalizeWallet } from '../_shared/utils.ts'

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

    if (body.action === 'create_collection') {
      const { data, error } = await supabase
        .from('collections')
        .insert({
          creator_wallet: wallet,
          name: body.name,
          symbol: body.symbol,
          description: body.description ?? '',
          mint_mode: body.mintMode ?? 'lazy',
          max_supply: body.maxSupply ?? 10000,
          club_burn_amount: body.clubBurnAmount ?? 0,
          burn_on_mint: body.burnOnMint ?? false,
          burn_on_resale: body.burnOnResale ?? false,
          storage_provider: body.storageProvider ?? 'supabase',
          chain_id: body.chainId ?? 52014,
        })
        .select()
        .single()
      if (error) throw error
      return new Response(JSON.stringify({ collection: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.action === 'update_collection') {
      const { data, error } = await supabase
        .from('collections')
        .update({
          name: body.name,
          symbol: body.symbol,
          description: body.description,
          mint_mode: body.mintMode,
          max_supply: body.maxSupply,
          club_burn_amount: body.clubBurnAmount,
          burn_on_mint: body.burnOnMint,
          burn_on_resale: body.burnOnResale,
          contract_address: body.contractAddress,
          status: body.status,
          base_uri: body.baseUri,
          chain_id: body.chainId,
        })
        .eq('id', body.collectionId)
        .eq('creator_wallet', wallet)
        .select()
        .single()
      if (error) throw error
      return new Response(JSON.stringify({ collection: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.action === 'add_token') {
      const { data, error } = await supabase
        .from('collection_tokens')
        .insert({
          collection_id: body.collectionId,
          token_id: body.tokenId,
          name: body.name,
          description: body.description ?? '',
          attributes: body.attributes ?? [],
          image_storage_path: body.imageStoragePath,
        })
        .select()
        .single()
      if (error) throw error
      return new Response(JSON.stringify({ token: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.action === 'update_token') {
      const { data, error } = await supabase
        .from('collection_tokens')
        .update({
          name: body.name,
          description: body.description,
          attributes: body.attributes,
          image_storage_path: body.imageStoragePath,
          token_uri: body.tokenUri,
          minted: body.minted,
          mint_tx_hash: body.mintTxHash,
        })
        .eq('id', body.tokenId)
        .select()
        .single()
      if (error) throw error
      return new Response(JSON.stringify({ token: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Unknown action')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Collection API failed'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
