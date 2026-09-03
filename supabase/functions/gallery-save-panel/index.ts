import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { JsonRpcProvider, Contract } from 'https://esm.sh/ethers@6.15.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders, normalizeWallet } from '../_shared/utils.ts'
import {
  cacheGalleryMedia,
  enqueueGalleryTokens,
  pruneOrphanedGalleryMedia,
  resolvePanelDisplayTokenId,
  syncGalleryPanelTokens,
  tokenIdsForPanel,
  triggerGalleryCacheTick,
} from '../_shared/gallery-media-cache.ts'

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
    const panelKey = String(body.panelKey ?? '')
    const lockDurationDays = Math.max(0, Math.min(30, Number(body.lockDurationDays ?? 0)))
    const lockingGemTokenId = body.lockingGemTokenId ? String(body.lockingGemTokenId) : null

    if (!panelKey) throw new Error('Missing panelKey')
    if (!body.contract_address?.trim()) throw new Error('Contract address is required')

    const owned = await getOwnedGemTokens(wallet)
    if (owned.length < 1) throw new Error('ElectroGem required to edit gallery panels')

    const { data: existingLock } = await supabase
      .from('panel_locks')
      .select('*')
      .eq('panel_id', panelKey)
      .maybeSingle()

    if (existingLock) {
      const until = new Date(existingLock.locked_until)
      const lockedByOther =
        until > new Date() &&
        existingLock.locked_by_address?.toLowerCase() !== wallet
      if (lockedByOther) throw new Error('Panel is locked by another curator')
    }

    const { error: cfgErr } = await supabase.from('gallery_config').upsert({
      panel_key: panelKey,
      collection_name: body.collection_name ?? null,
      contract_address: String(body.contract_address).trim().toLowerCase(),
      default_token_id: Number(body.default_token_id ?? 1),
      show_collection: Boolean(body.show_collection),
      wall_color: body.wall_color ?? '#4A235A',
      text_color: body.text_color ?? '#F4D03F',
      updated_at: new Date().toISOString(),
      updated_by_address: wallet,
    })

    if (cfgErr) throw cfgErr

    const contractAddress = String(body.contract_address).trim().toLowerCase()
    const defaultTokenId = Number(body.default_token_id ?? 1)
    const showCollection = Boolean(body.show_collection)
    const tokenIds = await tokenIdsForPanel(
      contractAddress,
      defaultTokenId,
      showCollection,
      40,
      panelKey,
      supabase,
    )
    const displayTokenId = resolvePanelDisplayTokenId(defaultTokenId, showCollection, tokenIds)

    await enqueueGalleryTokens(supabase, contractAddress, tokenIds)
    if (displayTokenId) {
      await cacheGalleryMedia(supabase, contractAddress, displayTokenId)
    }
    await syncGalleryPanelTokens(supabase)
    await pruneOrphanedGalleryMedia(supabase)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    // @ts-ignore EdgeRuntime.waitUntil exists on Supabase edge
    const waitUntil = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
      .EdgeRuntime?.waitUntil
    const kick = triggerGalleryCacheTick(supabaseUrl, serviceKey)
    if (waitUntil) waitUntil(kick)
    else await kick

    if (lockDurationDays === 0) {
      await supabase.from('panel_locks').delete().eq('panel_id', panelKey)
    } else {
      const gemToUse =
        lockingGemTokenId && owned.includes(lockingGemTokenId)
          ? lockingGemTokenId
          : owned.find((id) => id === existingLock?.locking_gem_token_id) ?? owned[0]

      if (!gemToUse) throw new Error('No available ElectroGem to lock this panel')

      const until = new Date(Date.now() + lockDurationDays * 86400000).toISOString()
      const { error: lockErr } = await supabase.from('panel_locks').upsert({
        panel_id: panelKey,
        contract_address: String(body.contract_address).trim().toLowerCase(),
        token_id: String(body.default_token_id ?? 1),
        locked_by_address: wallet,
        locked_until: until,
        locking_gem_token_id: gemToUse,
      })
      if (lockErr) throw lockErr
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: message }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
