import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { JsonRpcProvider, Contract } from 'https://esm.sh/ethers@6.15.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders, normalizeWallet } from '../_shared/utils.ts'
import {
  cacheGalleryMedia,
  pruneOrphanedGalleryMedia,
  resolvePanelDisplayTokenId,
  syncGalleryPanelTokens,
  tokenIdsForPanel,
} from '../_shared/gallery-media-cache.ts'
import {
  getMintedTokenIdsForGallery,
  upsertContractMintedIds,
} from '../_shared/gallery-minted-ids.ts'
import { parsePersonalPanelKey } from '../_shared/personal-gallery.ts'

const ELECTRO_GEMS_ADDRESS =
  Deno.env.get('ELECTROGEMS_NFT_ADDRESS') ?? '0xcff0d88Ed5311bAB09178b6ec19A464100880984'
const RPC_URL = Deno.env.get('ETN_RPC_URL') ?? 'https://rpc.ankr.com/electroneum'

const GEM_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
]

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

async function getOwnedGemTokens(wallet: string): Promise<string[]> {
  const provider = new JsonRpcProvider(RPC_URL)
  const contract = new Contract(ELECTRO_GEMS_ADDRESS, GEM_ABI, provider)
  const balance = Number(await contract.balanceOf(wallet))
  if (balance === 0) return []

  const tokens: string[] = []
  const limit = Math.min(balance, 20)
  for (let i = 0; i < limit; i++) {
    try {
      tokens.push((await contract.tokenOfOwnerByIndex(wallet, i)).toString())
    } catch {
      break
    }
  }
  return tokens
}

function parsePanelKey(panelKey: string): { roomId: string; slot: string } | null {
  const parsed = parsePersonalPanelKey(panelKey)
  if (!parsed) return null
  return parsed
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const body = await req.json()
    const wallet = normalizeWallet(body.walletAddress ?? '')
    const panelKey = String(body.panelKey ?? '')
    const roomId = String(body.roomId ?? '')

    const parsed = parsePanelKey(panelKey)
    if (!parsed || parsed.roomId !== roomId) throw new Error('Invalid personal panel key')

    const { data: room } = await supabase
      .from('personal_gallery_rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle()

    if (!room) throw new Error('Personal gallery room not found')
    if (String(room.owner_address).toLowerCase() !== wallet) {
      throw new Error('Only the room owner can edit this gallery')
    }

    const owned = await getOwnedGemTokens(wallet)
    if (owned.length < 1) {
      throw new Error('You must hold at least one ElectroGem to edit this room')
    }

    if (!body.contract_address?.trim()) throw new Error('Contract address is required')

    const contractAddress = String(body.contract_address).trim().toLowerCase()
    const defaultTokenId = Number(body.default_token_id ?? 1)
    const showCollection = Boolean(body.show_collection)

    const mintedTokenIds = await getMintedTokenIdsForGallery(supabase, contractAddress)
    if (mintedTokenIds.length === 0) {
      throw new Error('No minted tokens found for this collection')
    }
    await upsertContractMintedIds(supabase, contractAddress, mintedTokenIds)

    const tokenIds = await tokenIdsForPanel(
      contractAddress,
      defaultTokenId,
      showCollection,
      40,
      parsed.slot,
      supabase,
      body.allowed_token_ids ?? null,
    )
    if (tokenIds.length === 0) {
      throw new Error('No gallery tokens could be resolved for this panel')
    }

    const displayTokenId = resolvePanelDisplayTokenId(defaultTokenId, showCollection, tokenIds)
    if (!displayTokenId) throw new Error('Could not resolve display token')

    const cacheResults = await Promise.all(
      tokenIds.map((tokenId) => cacheGalleryMedia(supabase, contractAddress, tokenId)),
    )
    const failed = cacheResults
      .map((result, index) => ({ result, tokenId: tokenIds[index] }))
      .filter(({ result }) => !result.ok)
    if (failed.length > 0) {
      const detail = failed
        .map(({ tokenId, result }) => `#${tokenId}: ${result.ok === false ? result.error : 'unknown'}`)
        .join('; ')
      throw new Error(`Failed to cache gallery images: ${detail}`)
    }

    const { error: cfgErr } = await supabase.from('gallery_config').upsert({
      panel_key: panelKey,
      room_id: roomId,
      collection_name: body.collection_name ?? null,
      contract_address: contractAddress,
      default_token_id: defaultTokenId,
      show_collection: showCollection,
      allowed_token_ids: body.allowed_token_ids?.trim() || null,
      wall_color: body.wall_color ?? '#36454F',
      text_color: body.text_color ?? '#40E0D0',
      updated_at: new Date().toISOString(),
      updated_by_address: wallet,
    })

    if (cfgErr) throw cfgErr

    await supabase.from('gallery_panel_tokens').upsert(
      {
        panel_key: panelKey,
        room_id: roomId,
        contract_address: contractAddress,
        token_id: displayTokenId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'panel_key' },
    )

    await syncGalleryPanelTokens(supabase, roomId)
    await pruneOrphanedGalleryMedia(supabase, roomId)

    const origin =
      Deno.env.get('METADATA_PUBLIC_ORIGIN')?.trim() ||
      Deno.env.get('VITE_APP_URL')?.trim() ||
      'https://www.etn-nft-launchpad.club'

    return new Response(
      JSON.stringify({
        success: true,
        shareUrl: `${origin.replace(/\/$/, '')}/gallery/room/${room.slug}`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: message }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
