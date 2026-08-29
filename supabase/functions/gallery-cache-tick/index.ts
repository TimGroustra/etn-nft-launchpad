import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/utils.ts'
import {
  processGalleryCacheBatch,
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
    const result = await processGalleryCacheBatch(supabase)

    // Chain another tick while work remains — slow and steady, one batch at a time.
    if (result.remaining > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      // @ts-ignore EdgeRuntime.waitUntil exists on Supabase edge
      const waitUntil = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
        .EdgeRuntime?.waitUntil
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
