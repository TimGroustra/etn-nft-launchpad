import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/utils.ts'
import {
  enqueueGalleryPanelsFromConfig,
  enqueueGalleryTokens,
  processGalleryCacheBatch,
  pruneOrphanedGalleryMedia,
  refreshStaleGalleryContracts,
  syncGalleryPanelTokens,
  triggerGalleryCacheTick,
} from '../_shared/gallery-media-cache.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    let body: {
      enqueuePanels?: boolean
      syncPanels?: boolean
      warmOnly?: boolean
      enqueueTokens?: Array<{ contractAddress: string; tokenIds: number[] }>
    } = {}
    if (req.method === 'POST') {
      try {
        body = await req.json()
      } catch {
        body = {}
      }
    }

    const waitUntil = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
      .EdgeRuntime?.waitUntil
    const mintRefresh = refreshStaleGalleryContracts(supabase)
    if (waitUntil) waitUntil(mintRefresh)
    else await mintRefresh

    if (body.syncPanels) {
      const synced = await syncGalleryPanelTokens(supabase)
      const pruned = await pruneOrphanedGalleryMedia(supabase)
      return new Response(JSON.stringify({ success: true, ...synced, ...pruned }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.enqueueTokens?.length) {
      let enqueued = 0
      for (const item of body.enqueueTokens) {
        await enqueueGalleryTokens(supabase, item.contractAddress, item.tokenIds)
        enqueued += item.tokenIds.length
      }
      const kick = triggerGalleryCacheTick(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        0,
      )
      if (waitUntil) waitUntil(kick)
      else await kick
      return new Response(JSON.stringify({ success: true, enqueued }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.enqueuePanels) {
      const enqueueResult = await enqueueGalleryPanelsFromConfig(supabase)
      return new Response(JSON.stringify({ success: true, ...enqueueResult }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = await processGalleryCacheBatch(supabase, {
      skipIndex: body.warmOnly === true,
    })

    if (result.remaining > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const next = triggerGalleryCacheTick(supabaseUrl, serviceKey)
      if (waitUntil) waitUntil(next)
      else await next
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
