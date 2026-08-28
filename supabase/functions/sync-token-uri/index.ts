import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { assertV2MetadataEditable, isAdminWallet } from '../_shared/admin.ts'
import { buildNftMetadata } from '../_shared/nft-metadata.ts'
import {
  assertStoragePathForCollection,
  buildCollectionMetadataPath,
} from '../_shared/storage-paths.ts'
import {
  getPublicImageUrlFromPath,
  getPublicMetadataUrl,
} from '../_shared/metadata-public-urls.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const sessionToken = req.headers.get('x-session-token') ?? ''
    const { collectionId, tokenId, walletAddress, contractAddress: contractAddressOverride } = await req.json()
    if (!collectionId || tokenId === undefined || !walletAddress) throw new Error('Missing parameters')

    const wallet = normalizeWallet(walletAddress)
    await validateSession(supabase, sessionToken, wallet)

    const { data: collection } = await supabase
      .from('collections')
      .select('*')
      .eq('id', collectionId)
      .maybeSingle()
    if (!collection) throw new Error('Collection not found')
    if (collection.creator_wallet !== wallet && !isAdminWallet(wallet)) {
      throw new Error('Collection not found')
    }

    const { data: token, error: tokenError } = await supabase
      .from('collection_tokens')
      .select('*')
      .eq('collection_id', collectionId)
      .eq('token_id', tokenId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (tokenError) throw tokenError
    if (!token) throw new Error('Token not found')

    if (token.image_storage_path) {
      const pathError = assertStoragePathForCollection(collectionId, token.image_storage_path)
      if (pathError) throw new Error(pathError)
    }

    const imageUrl = token.image_storage_path
      ? getPublicImageUrlFromPath(token.image_storage_path, token.updated_at ?? Date.now())
      : ''

    const contractAddress =
      (typeof contractAddressOverride === 'string' && contractAddressOverride.trim()) ||
      collection.contract_address
    if (!contractAddress) {
      throw new Error('Collection contract address is required to write royalty metadata.')
    }

    const metadata = buildNftMetadata({
      name: token.name,
      description: token.description,
      attributes: (token.attributes ?? []) as { trait_type: string; value: string | number }[],
      imageUrl,
      royaltyBps: Number(collection.royalty_bps ?? 0),
      feeRecipient: contractAddress,
    })

    const metadataPath = buildCollectionMetadataPath(collectionId, tokenId)
    const { error: uploadError } = await supabase.storage
      .from('collection-metadata')
      .upload(metadataPath, JSON.stringify(metadata, null, 2), {
        contentType: 'application/json',
        upsert: true,
      })
    if (uploadError) throw uploadError

    const tokenUri = getPublicMetadataUrl(collectionId, tokenId)
    const onChainTokenUri = `${tokenId}.json`

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
        onChainTokenUri,
        contractAddress: collection.contract_address ?? contractAddress,
        functionName: 'setTokenURI',
        args: [tokenId, onChainTokenUri],
        minted: Boolean(token.minted),
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
