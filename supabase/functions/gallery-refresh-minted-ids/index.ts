import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/utils.ts'
import {
  listGalleryContractAddresses,
  refreshContractMintedIds,
  refreshStaleGalleryContracts,
} from '../_shared/gallery-minted-ids.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    let body: { contract_address?: string; force?: boolean } = {}
    if (req.method === 'POST') {
      try {
        body = await req.json()
      } catch {
        body = {}
      }
    }

    if (body.contract_address) {
      const ids = await refreshContractMintedIds(supabase, body.contract_address)
      return new Response(
        JSON.stringify({
          success: true,
          contract_address: body.contract_address.toLowerCase(),
          minted_token_ids: ids,
          refreshed_at: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (body.force) {
      const contracts = await listGalleryContractAddresses(supabase)
      const results = await Promise.all(
        contracts.map(async (contract) => {
          const ids = await refreshContractMintedIds(supabase, contract)
          return { contract_address: contract.toLowerCase(), count: ids.length }
        }),
      )
      return new Response(JSON.stringify({ success: true, refreshed: results }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = await refreshStaleGalleryContracts(supabase)
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
