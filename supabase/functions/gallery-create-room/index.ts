import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders, normalizeWallet } from '../_shared/utils.ts'
import { getOwnedGemTokens } from '../_shared/gem-ownership.ts'
import {
  PERSONAL_PANEL_SLOTS,
  personalPanelKey,
  slugifyRoomName,
  uniqueRoomSlug,
} from '../_shared/personal-gallery.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const body = await req.json()
    const wallet = normalizeWallet(body.walletAddress ?? '')
    const displayName = String(body.displayName ?? '').trim()

    if (!displayName || displayName.length < 2) throw new Error('Room name must be at least 2 characters')

    const owned = await getOwnedGemTokens(wallet)
    if (owned.length < 1) {
      throw new Error('You must hold at least one ElectroGem to create a personal gallery room')
    }

    const { data: existingRoom } = await supabase
      .from('personal_gallery_rooms')
      .select('id')
      .eq('owner_address', wallet)
      .maybeSingle()

    if (existingRoom) throw new Error('Your wallet already has a personal gallery room')

    const baseSlug = slugifyRoomName(displayName)
    const slug = await uniqueRoomSlug(supabase, baseSlug)

    const { data: room, error: roomErr } = await supabase
      .from('personal_gallery_rooms')
      .insert({
        slug,
        display_name: displayName,
        owner_address: wallet,
        electrogem_token_id: null,
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
