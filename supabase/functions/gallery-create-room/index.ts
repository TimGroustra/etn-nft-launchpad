import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { JsonRpcProvider, Contract } from 'https://esm.sh/ethers@6.15.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders, normalizeWallet } from '../_shared/utils.ts'
import {
  PERSONAL_PANEL_SLOTS,
  personalPanelKey,
  slugifyRoomName,
  uniqueRoomSlug,
} from '../_shared/personal-gallery.ts'

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const body = await req.json()
    const wallet = normalizeWallet(body.walletAddress ?? '')
    const displayName = String(body.displayName ?? '').trim()
    const electrogemTokenId = String(body.electrogemTokenId ?? '')

    if (!displayName || displayName.length < 2) throw new Error('Room name must be at least 2 characters')
    if (!electrogemTokenId) throw new Error('ElectroGem token ID is required')

    const owned = await getOwnedGemTokens(wallet)
    if (!owned.includes(electrogemTokenId)) {
      throw new Error('You must own this ElectroGem to create a personal gallery room')
    }

    const { data: existingRoom } = await supabase
      .from('personal_gallery_rooms')
      .select('id')
      .eq('electrogem_token_id', electrogemTokenId)
      .maybeSingle()

    if (existingRoom) throw new Error('This ElectroGem already has a personal gallery room')

    const baseSlug = slugifyRoomName(displayName)
    const slug = await uniqueRoomSlug(supabase, baseSlug)

    const { data: room, error: roomErr } = await supabase
      .from('personal_gallery_rooms')
      .insert({
        slug,
        display_name: displayName,
        owner_address: wallet,
        electrogem_token_id: electrogemTokenId,
        updated_at: new Date().toISOString(),
      })
      .select('id, slug, display_name')
      .single()

    if (roomErr || !room) throw roomErr ?? new Error('Failed to create room')

    const roomId = String(room.id)
    const configRows = PERSONAL_PANEL_SLOTS.map((slot) => ({
      panel_key: personalPanelKey(roomId, slot),
      room_id: roomId,
      collection_name: null,
      contract_address: null,
      default_token_id: 1,
      show_collection: false,
      wall_color: '#36454F',
      text_color: '#40E0D0',
      updated_at: new Date().toISOString(),
      updated_by_address: wallet,
    }))

    const { error: cfgErr } = await supabase.from('gallery_config').insert(configRows)
    if (cfgErr) throw cfgErr

    const origin =
      Deno.env.get('METADATA_PUBLIC_ORIGIN')?.trim() ||
      Deno.env.get('VITE_APP_URL')?.trim() ||
      'https://www.etn-nft-launchpad.club'

    return new Response(
      JSON.stringify({
        success: true,
        roomId,
        slug: room.slug,
        displayName: room.display_name,
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
