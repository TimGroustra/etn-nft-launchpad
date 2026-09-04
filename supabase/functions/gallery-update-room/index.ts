import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders, normalizeWallet } from '../_shared/utils.ts'
import { getOwnedGemTokens } from '../_shared/gem-ownership.ts'

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
    const roomId = String(body.roomId ?? '')
    const displayName = String(body.displayName ?? '').trim()

    if (!roomId) throw new Error('Room id is required')
    if (!displayName || displayName.length < 2) {
      throw new Error('Room name must be at least 2 characters')
    }
    if (displayName.length > 64) throw new Error('Room name must be 64 characters or fewer')

    const owned = await getOwnedGemTokens(wallet)
    if (owned.length < 1) {
      throw new Error('You must hold at least one ElectroGem to edit a personal gallery room')
    }

    const { data: room } = await supabase
      .from('personal_gallery_rooms')
      .select('id, slug, display_name, owner_address')
      .eq('id', roomId)
      .maybeSingle()

    if (!room) throw new Error('Personal gallery room not found')
    if (String(room.owner_address).toLowerCase() !== wallet) {
      throw new Error('Only the room owner can edit this gallery')
    }

    const { data: updated, error: updateErr } = await supabase
      .from('personal_gallery_rooms')
      .update({
        display_name: displayName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId)
      .select('id, slug, display_name')
      .single()

    if (updateErr || !updated) throw updateErr ?? new Error('Failed to update room')

    const origin =
      Deno.env.get('METADATA_PUBLIC_ORIGIN')?.trim() ||
      Deno.env.get('VITE_APP_URL')?.trim() ||
      'https://www.etn-nft-launchpad.club'

    return new Response(
      JSON.stringify({
        success: true,
        roomId: updated.id,
        slug: updated.slug,
        displayName: updated.display_name,
        shareUrl: `${origin.replace(/\/$/, '')}/gallery/room/${updated.slug}`,
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
