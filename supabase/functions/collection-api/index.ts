import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders, validateSession, normalizeWallet } from '../_shared/utils.ts'
import { validateCollectionPayload, validateTokenPayload } from '../_shared/collection-validation.ts'

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
      const collectionError = validateCollectionPayload(body)
      if (collectionError) throw new Error(collectionError)

      const { data, error } = await supabase
        .from('collections')
        .insert({
          creator_wallet: wallet,
          name: body.name,
          symbol: body.symbol,
          description: body.description ?? '',
          mint_mode: body.mintMode ?? 'lazy',
          max_supply: body.maxSupply ?? 10000,
          club_burn_amount: 0,
          mint_burn_bps: body.mintBurnBps ?? 0,
          burn_on_mint: body.burnOnMint ?? false,
          royalty_burn_bps: body.royaltyBurnBps ?? 0,
          mint_price_etn: body.mintPriceEtn ?? 0,
          max_mint_per_wallet: body.maxMintPerWallet ?? 0,
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
          club_burn_amount: 0,
          mint_burn_bps: body.mintBurnBps,
          burn_on_mint: body.burnOnMint,
          royalty_burn_bps: body.royaltyBurnBps,
          mint_price_etn: body.mintPriceEtn,
          max_mint_per_wallet: body.maxMintPerWallet,
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
      const tokenError = validateTokenPayload(body)
      if (tokenError) throw new Error(tokenError)

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
