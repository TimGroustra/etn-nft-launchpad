import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders, validateSession, normalizeWallet, normalizeContractAddress } from '../_shared/utils.ts'
import { validateCollectionPayload, validateTokenPayload } from '../_shared/collection-validation.ts'
import { canUseLaunchpadV2, isAdminWallet, assertV2MetadataEditable } from '../_shared/admin.ts'
import { readNftHoldings, resolvePublishFeeDiscountBps } from '../_shared/creator-access.ts'
import { createPublicClient, http } from 'https://esm.sh/viem@2.21.0'
import {
  buildCollectionImagePath,
  extensionFromContentType,
  validateCollectionImagePath,
} from '../_shared/storage-paths.ts'

async function getOwnedCollection(
  supabase: ReturnType<typeof createClient>,
  collectionId: string,
  wallet: string,
  columns = 'id, status, contract_address',
) {
  const { data: collection, error } = await supabase
    .from('collections')
    .select(columns.includes('creator_wallet') ? columns : `${columns}, creator_wallet`)
    .eq('id', collectionId)
    .maybeSingle()
  if (error) throw error
  if (!collection) throw new Error('Collection not found.')
  const creatorWallet = (collection as { creator_wallet?: string }).creator_wallet
  if (creatorWallet !== wallet && !isAdminWallet(wallet)) {
    throw new Error('Collection not found.')
  }
  return collection
}

async function assertCollectionEditable(
  supabase: ReturnType<typeof createClient>,
  collectionId: string,
  wallet: string,
) {
  const collection = await getOwnedCollection(supabase, collectionId, wallet, 'id, status, contract_version')
  if (collection.status === 'archived') {
    throw new Error('This collection is archived. Restore it from your dashboard to make changes.')
  }
  return collection
}

async function assertMetadataEditable(
  supabase: ReturnType<typeof createClient>,
  collectionId: string,
  wallet: string,
) {
  const collection = await assertCollectionEditable(supabase, collectionId, wallet)
  assertV2MetadataEditable(collection, wallet)
  return collection
}

const CHAIN_RPC: Record<number, string> = {
  52014: 'https://rpc.electroneum.com',
  5201420: 'https://rpc.ankr.com/electroneum_testnet',
}

async function resolveDualHolderBurnExempt(wallet: string, chainId = 52014): Promise<boolean> {
  const rpc = CHAIN_RPC[chainId]
  if (!rpc) return false
  const client = createPublicClient({ transport: http(rpc) })
  const holdings = await readNftHoldings(client, wallet as `0x${string}`)
  return resolvePublishFeeDiscountBps(holdings) > 0n
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

    if (body.action === 'create_collection') {
      const chainId = Number(body.chainId ?? 52014)
      const dualHolderBurnExempt = await resolveDualHolderBurnExempt(wallet, chainId)
      const collectionError = validateCollectionPayload(body, { dualHolderBurnExempt })
      if (collectionError) throw new Error(collectionError)

      const v2Allowed = await canUseLaunchpadV2(supabase, wallet)
      const contractVersion = v2Allowed && Number(body.contractVersion ?? 2) !== 1 ? 2 : 1
      const tokenStandard =
        v2Allowed && body.tokenStandard === 'erc1155' ? 'erc1155' : 'erc721'

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
          royalty_bps: body.royaltyBps ?? 500,
          mint_price_etn: body.mintPriceEtn ?? 0,
          max_mint_per_wallet: body.maxMintPerWallet ?? 0,
          show_on_mint_panel: Boolean(body.showOnMintPanel) && Number(body.mintPriceEtn ?? 0) > 0,
          random_public_mint: Boolean(body.randomPublicMint) && Number(body.mintPriceEtn ?? 0) > 0,
          token_standard: tokenStandard,
          contract_version: contractVersion,
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
      const collection = await getOwnedCollection(
        supabase,
        body.collectionId,
        wallet,
        'id, status, contract_version, name, symbol, description, mint_mode, max_supply, mint_burn_bps, burn_on_mint, royalty_burn_bps, royalty_bps, mint_price_etn, max_mint_per_wallet, random_public_mint, show_on_mint_panel, mint_panel_admin_only, base_uri, chain_id, contract_address',
      )
      if (collection.status === 'archived') {
        throw new Error('This collection is archived. Restore it from your dashboard to make changes.')
      }

      const updates: Record<string, unknown> = {}
      if (body.name !== undefined) updates.name = body.name
      if (body.symbol !== undefined) updates.symbol = body.symbol
      if (body.description !== undefined) updates.description = body.description
      if (body.mintMode !== undefined) updates.mint_mode = body.mintMode
      if (body.maxSupply !== undefined) updates.max_supply = body.maxSupply
      if (body.mintBurnBps !== undefined) updates.mint_burn_bps = body.mintBurnBps
      if (body.burnOnMint !== undefined) updates.burn_on_mint = body.burnOnMint
      if (body.royaltyBurnBps !== undefined) updates.royalty_burn_bps = body.royaltyBurnBps
      if (body.royaltyBps !== undefined) updates.royalty_bps = body.royaltyBps
      if (body.mintPriceEtn !== undefined) updates.mint_price_etn = body.mintPriceEtn
      if (body.maxMintPerWallet !== undefined) updates.max_mint_per_wallet = body.maxMintPerWallet
      if (typeof body.showOnMintPanel === 'boolean') {
        updates.show_on_mint_panel = body.showOnMintPanel && Number(body.mintPriceEtn ?? 0) > 0
      }
      if (typeof body.mintPanelAdminOnly === 'boolean') {
        if (!isAdminWallet(wallet)) {
          throw new Error('Only admins can set admin-only mint panel visibility.')
        }
        updates.mint_panel_admin_only = body.mintPanelAdminOnly
        if (body.mintPanelAdminOnly) {
          updates.show_on_mint_panel = true
        }
      }
      if (typeof body.randomPublicMint === 'boolean') {
        updates.random_public_mint = body.randomPublicMint && Number(body.mintPriceEtn ?? 0) > 0
      }
      if (typeof body.contractAddress === 'string') {
        updates.contract_address = normalizeContractAddress(body.contractAddress)
      } else if (body.contractAddress !== undefined) {
        updates.contract_address = body.contractAddress
      }
      if (body.status !== undefined) {
        if (body.status === 'archived') {
          throw new Error('Use archive_collection to archive a collection.')
        }
        updates.status = body.status
      }
      if (body.baseUri !== undefined) updates.base_uri = body.baseUri
      if (body.chainId !== undefined) updates.chain_id = body.chainId

      if (Object.keys(updates).length === 0) {
        throw new Error('No collection fields to update.')
      }

      const burnFields = ['mint_burn_bps', 'burn_on_mint', 'royalty_burn_bps'] as const
      const burnChanged = burnFields.some((key) => updates[key] !== undefined)
      if (burnChanged) {
        const chainId = Number(updates.chain_id ?? collection.chain_id ?? 52014)
        const dualHolderBurnExempt = await resolveDualHolderBurnExempt(wallet, chainId)
        const collectionError = validateCollectionPayload(
          {
            name: String(updates.name ?? collection.name),
            symbol: String(updates.symbol ?? collection.symbol),
            description: String(updates.description ?? collection.description ?? ''),
            mintMode: (updates.mint_mode ?? collection.mint_mode) as 'lazy' | 'batch',
            maxSupply: Number(updates.max_supply ?? collection.max_supply),
            mintBurnBps: Number(updates.mint_burn_bps ?? collection.mint_burn_bps ?? 0),
            burnOnMint: Boolean(updates.burn_on_mint ?? collection.burn_on_mint),
            royaltyBurnBps: Number(updates.royalty_burn_bps ?? collection.royalty_burn_bps ?? 0),
            royaltyBps: Number(updates.royalty_bps ?? collection.royalty_bps ?? 500),
            mintPriceEtn: Number(updates.mint_price_etn ?? collection.mint_price_etn ?? 0),
            maxMintPerWallet: Number(updates.max_mint_per_wallet ?? collection.max_mint_per_wallet ?? 0),
            showOnMintPanel: Boolean(updates.show_on_mint_panel ?? collection.show_on_mint_panel),
            randomPublicMint: Boolean(updates.random_public_mint ?? collection.random_public_mint),
          },
          { dualHolderBurnExempt },
        )
        if (collectionError) throw new Error(collectionError)
      }

      const blockedOnPublishedV2 = new Set([
        'name',
        'symbol',
        'description',
        'mint_mode',
        'max_supply',
        'mint_burn_bps',
        'burn_on_mint',
        'royalty_burn_bps',
        'royalty_bps',
        'mint_price_etn',
        'max_mint_per_wallet',
        'random_public_mint',
      ])
      const hasBlockedChange = [...blockedOnPublishedV2].some((key) => {
        if (updates[key] === undefined) return false
        const current = (collection as Record<string, unknown>)[key]
        return JSON.stringify(updates[key]) !== JSON.stringify(current)
      })
      if (hasBlockedChange) {
        assertV2MetadataEditable(collection, wallet)
      }

      let updateQuery = supabase.from('collections').update(updates).eq('id', body.collectionId)
      if (!isAdminWallet(wallet)) {
        updateQuery = updateQuery.eq('creator_wallet', wallet)
      }
      const { data, error } = await updateQuery.select().single()
      if (error) throw error
      return new Response(JSON.stringify({ collection: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.action === 'prepare_image_upload') {
      if (!body.collectionId) throw new Error('Collection ID is required.')
      await assertMetadataEditable(supabase, body.collectionId, wallet)
      const tokenId = Number(body.tokenId)
      if (!Number.isInteger(tokenId) || tokenId < 1) throw new Error('Invalid token ID.')

      const contentType = String(body.contentType ?? 'image/png')
      const extension = extensionFromContentType(contentType)
      const path = buildCollectionImagePath(body.collectionId, tokenId, extension)

      const { data, error: signedError } = await supabase.storage
        .from('collection-images')
        .createSignedUploadUrl(path, { upsert: true })
      if (signedError) throw signedError
      if (!data?.signedUrl) throw new Error('Could not create image upload URL.')

      return new Response(JSON.stringify({ path, signedUrl: data.signedUrl, token: data.token }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.action === 'upload_image') {
      if (!body.collectionId) throw new Error('Collection ID is required.')
      await assertMetadataEditable(supabase, body.collectionId, wallet)
      const tokenId = Number(body.tokenId)
      if (!Number.isInteger(tokenId) || tokenId < 1) throw new Error('Invalid token ID.')

      const contentType = String(body.contentType ?? 'image/png')
      const extension = extensionFromContentType(contentType)
      const path = buildCollectionImagePath(body.collectionId, tokenId, extension)

      if (!body.imageBase64 || typeof body.imageBase64 !== 'string') {
        throw new Error('Image data is required.')
      }

      const bytes = Uint8Array.from(atob(body.imageBase64), (char) => char.charCodeAt(0))
      if (bytes.length === 0) throw new Error('Image file is empty.')
      if (bytes.length > 10 * 1024 * 1024) throw new Error('Image must be 10 MB or smaller.')

      const { error: uploadError } = await supabase.storage
        .from('collection-images')
        .upload(path, bytes, { upsert: true, contentType })
      if (uploadError) throw uploadError

      return new Response(JSON.stringify({ path }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.action === 'batch_upsert_tokens') {
      if (!body.collectionId) throw new Error('Collection ID is required.')
      const items = Array.isArray(body.tokens) ? body.tokens : []
      if (items.length === 0) throw new Error('At least one token is required.')
      if (items.length > 100) throw new Error('A maximum of 100 tokens can be saved per batch.')

      await assertMetadataEditable(supabase, body.collectionId, wallet)

      const normalized = items.map((item: Record<string, unknown>) => {
        const tokenError = validateTokenPayload({ ...item, collectionId: body.collectionId })
        if (tokenError) throw new Error(tokenError)
        const tokenId = Number(item.tokenId)
        const pathError = validateCollectionImagePath(
          body.collectionId,
          tokenId,
          String(item.imageStoragePath),
        )
        if (pathError) throw new Error(pathError)
        return {
          tokenId,
          name: String(item.name).trim(),
          description: String(item.description ?? ''),
          attributes: item.attributes ?? [],
          imageStoragePath: String(item.imageStoragePath),
          editionSize: Math.max(1, Number(item.editionSize ?? 1)),
        }
      })

      const tokenIds = normalized.map((item) => item.tokenId)
      const { data: existingRows, error: existingError } = await supabase
        .from('collection_tokens')
        .select('id, token_id')
        .eq('collection_id', body.collectionId)
        .in('token_id', tokenIds)
      if (existingError) throw existingError

      const existingByTokenId = new Map(
        (existingRows ?? [])
          .filter((row) => row.token_id != null)
          .map((row) => [row.token_id as number, row.id as string]),
      )

      const saved = []
      for (const item of normalized) {
        const existingId = existingByTokenId.get(item.tokenId)
        if (existingId) {
          const { data, error } = await supabase
            .from('collection_tokens')
            .update({
              name: item.name,
              description: item.description,
              attributes: item.attributes,
              image_storage_path: item.imageStoragePath,
              token_id: item.tokenId,
              edition_size: item.editionSize,
            })
            .eq('id', existingId)
            .select()
            .single()
          if (error) throw error
          saved.push(data)
        } else {
          const { data, error } = await supabase
            .from('collection_tokens')
            .insert({
              collection_id: body.collectionId,
              token_id: item.tokenId,
              name: item.name,
              description: item.description,
              attributes: item.attributes,
              image_storage_path: item.imageStoragePath,
              edition_size: item.editionSize,
            })
            .select()
            .single()
          if (error) throw error
          saved.push(data)
        }
      }

      return new Response(JSON.stringify({ tokens: saved }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.action === 'upsert_token' || body.action === 'add_token') {
      const tokenError = validateTokenPayload(body)
      if (tokenError) throw new Error(tokenError)
      await assertMetadataEditable(supabase, body.collectionId, wallet)

      const { data: existingRows, error: existingError } = await supabase
        .from('collection_tokens')
        .select('id')
        .eq('collection_id', body.collectionId)
        .eq('token_id', body.tokenId)
        .order('updated_at', { ascending: false })
        .limit(1)
      if (existingError) throw existingError
      const existing = existingRows?.[0]

      if (existing) {
        const { data, error } = await supabase
          .from('collection_tokens')
          .update({
            name: body.name,
            description: body.description ?? '',
            attributes: body.attributes ?? [],
            image_storage_path: body.imageStoragePath,
            token_id: body.tokenId,
            edition_size: Math.max(1, Number(body.editionSize ?? 1)),
          })
          .eq('id', existing.id)
          .select()
          .single()
        if (error) throw error
        return new Response(JSON.stringify({ token: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error } = await supabase
        .from('collection_tokens')
        .insert({
          collection_id: body.collectionId,
          token_id: body.tokenId,
          name: body.name,
          description: body.description ?? '',
          attributes: body.attributes ?? [],
          image_storage_path: body.imageStoragePath,
          edition_size: Math.max(1, Number(body.editionSize ?? 1)),
        })
        .select()
        .single()
      if (error) throw error
      return new Response(JSON.stringify({ token: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.action === 'update_token') {
      if (!body.tokenId) throw new Error('Token ID is required.')

      const { data: existing, error: fetchError } = await supabase
        .from('collection_tokens')
        .select('id, collection_id, token_id')
        .eq('id', body.tokenId)
        .maybeSingle()
      if (fetchError) throw fetchError
      if (!existing) throw new Error('Token not found.')

      await getOwnedCollection(supabase, existing.collection_id, wallet, 'id')

      const metadataUpdatesRequested =
        body.name !== undefined ||
        body.description !== undefined ||
        body.attributes !== undefined ||
        body.imageStoragePath !== undefined ||
        body.tokenNumber !== undefined ||
        body.tokenUri !== undefined ||
        body.editionSize !== undefined
      if (metadataUpdatesRequested) {
        const { data: collectionRow, error: collectionError } = await supabase
          .from('collections')
          .select('contract_version, status')
          .eq('id', existing.collection_id)
          .maybeSingle()
        if (collectionError) throw collectionError
        if (collectionRow) {
          assertV2MetadataEditable(collectionRow, wallet)
        }
      }

      const updates: Record<string, unknown> = {}
      if (body.name !== undefined) updates.name = body.name
      if (body.description !== undefined) updates.description = body.description
      if (body.attributes !== undefined) updates.attributes = body.attributes
      if (body.imageStoragePath !== undefined) {
        const tokenNumber = body.tokenNumber ?? existing.token_id
        if (tokenNumber == null) throw new Error('Token number is required to validate image path.')
        const pathError = validateCollectionImagePath(
          existing.collection_id,
          Number(tokenNumber),
          String(body.imageStoragePath),
        )
        if (pathError) throw new Error(pathError)
        updates.image_storage_path = body.imageStoragePath
      }
      if (body.tokenNumber !== undefined) updates.token_id = body.tokenNumber
      if (body.tokenUri !== undefined) updates.token_uri = body.tokenUri
      if (body.minted !== undefined) updates.minted = body.minted
      if (body.mintTxHash !== undefined) updates.mint_tx_hash = body.mintTxHash
      if (body.editionSize !== undefined) updates.edition_size = Math.max(1, Number(body.editionSize))

      if (Object.keys(updates).length === 0) {
        throw new Error('No token fields to update.')
      }

      const { data, error } = await supabase
        .from('collection_tokens')
        .update(updates)
        .eq('id', body.tokenId)
        .select()
        .single()
      if (error) throw error
      return new Response(JSON.stringify({ token: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.action === 'delete_token') {
      if (!body.tokenId) throw new Error('Token ID is required.')

      const { data: existing, error: fetchError } = await supabase
        .from('collection_tokens')
        .select('id, collection_id')
        .eq('id', body.tokenId)
        .maybeSingle()
      if (fetchError) throw fetchError
      if (!existing) throw new Error('Token not found.')

      await assertMetadataEditable(supabase, existing.collection_id, wallet)

      const { error: deleteError } = await supabase
        .from('collection_tokens')
        .delete()
        .eq('id', body.tokenId)
      if (deleteError) throw deleteError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.action === 'delete_collection') {
      if (!body.collectionId) throw new Error('Collection ID is required.')

      const collection = await getOwnedCollection(supabase, body.collectionId, wallet, 'id, status, contract_address')
      if (collection.status !== 'draft') {
        throw new Error('Only draft collections can be deleted.')
      }
      if (collection.contract_address) {
        throw new Error('Published collections cannot be deleted.')
      }

      for (const bucket of ['collection-images', 'collection-metadata'] as const) {
        const { data: files, error: listError } = await supabase.storage.from(bucket).list(collection.id)
        if (listError) throw listError
        if (files?.length) {
          const paths = files.map((file) => `${collection.id}/${file.name}`)
          const { error: removeError } = await supabase.storage.from(bucket).remove(paths)
          if (removeError) throw removeError
        }
      }

      const { error: deleteError } = await supabase
        .from('collections')
        .delete()
        .eq('id', collection.id)
        .eq('creator_wallet', wallet)
        .eq('status', 'draft')
      if (deleteError) throw deleteError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.action === 'archive_collection') {
      if (!body.collectionId) throw new Error('Collection ID is required.')

      const collection = await getOwnedCollection(supabase, body.collectionId, wallet, 'id, status')
      if (collection.status === 'archived') throw new Error('Collection is already archived.')

      const { data, error } = await supabase
        .from('collections')
        .update({ status: 'archived', show_on_mint_panel: false })
        .eq('id', collection.id)
        .eq('creator_wallet', wallet)
        .select()
        .single()
      if (error) throw error

      return new Response(JSON.stringify({ collection: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.action === 'restore_collection') {
      if (!body.collectionId) throw new Error('Collection ID is required.')

      const collection = await getOwnedCollection(
        supabase,
        body.collectionId,
        wallet,
        'id, status, contract_address',
      )
      if (collection.status !== 'archived') throw new Error('Collection is not archived.')

      const nextStatus = collection.contract_address ? 'published' : 'draft'
      const { data, error } = await supabase
        .from('collections')
        .update({ status: nextStatus })
        .eq('id', collection.id)
        .eq('creator_wallet', wallet)
        .select()
        .single()
      if (error) throw error

      return new Response(JSON.stringify({ collection: data }), {
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
