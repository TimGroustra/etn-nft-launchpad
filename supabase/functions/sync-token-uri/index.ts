import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders, validateSession, normalizeWallet } from '../_shared/utils.ts'

interface NftAttribute {
  trait_type: string
  value: string | number
}

function buildMetadata(token: {
  name: string
  description: string | null
  attributes: NftAttribute[]
  imageUrl: string
}) {
  return {
    name: token.name,
    description: token.description ?? '',
    image: token.imageUrl,
    attributes: token.attributes ?? [],
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const sessionToken = req.headers.get('x-session-token') ?? ''
    const { collectionId, tokenId, walletAddress } = await req.json()
    if (!collectionId || tokenId === undefined || !walletAddress) throw new Error('Missing parameters')

    const wallet = normalizeWallet(walletAddress)
    await validateSession(supabase, sessionToken, wallet)

    const { data: collection } = await supabase
      .from('collections')
      .select('*')
      .eq('id', collectionId)
      .eq('creator_wallet', wallet)
      .maybeSingle()
    if (!collection) throw new Error('Collection not found')

    const { data: token } = await supabase
      .from('collection_tokens')
      .select('*')
      .eq('collection_id', collectionId)
      .eq('token_id', tokenId)
      .maybeSingle()
    if (!token) throw new Error('Token not found')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const imageUrl = token.image_storage_path
      ? `${supabaseUrl}/storage/v1/object/public/collection-images/${token.image_storage_path}`
      : ''

    const metadata = buildMetadata({
      name: token.name,
      description: token.description,
      attributes: token.attributes ?? [],
      imageUrl,
    })

    const metadataPath = `${collectionId}/${tokenId}.json`
    const { error: uploadError } = await supabase.storage
      .from('collection-metadata')
      .upload(metadataPath, JSON.stringify(metadata, null, 2), {
        contentType: 'application/json',
        upsert: true,
      })
    if (uploadError) throw uploadError

    const tokenUri = `${supabaseUrl}/storage/v1/object/public/collection-metadata/${metadataPath}`

    await supabase
      .from('collection_tokens')
      .update({
        metadata_storage_path: metadataPath,
        token_uri: tokenUri,
      })
      .eq('id', token.id)

    return new Response(
      JSON.stringify({
        tokenUri,
        contractAddress: collection.contract_address,
        functionName: 'setTokenURI',
        args: [tokenId, tokenUri],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
