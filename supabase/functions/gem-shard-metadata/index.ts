import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { createPublicClient, formatEther, http } from 'https://esm.sh/viem@2.55.19'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DISTRIBUTOR_ABI = [
  {
    type: 'function',
    name: 'pendingReward',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

function getMetadataBaseUrl(): string {
  const fromEnv = Deno.env.get('GEM_SHARDS_METADATA_BASE_URL')?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return `${getPublicOrigin()}/gem-shards/metadata`
}

function getImageBaseUrl(): string {
  const fromEnv = Deno.env.get('GEM_SHARDS_IMAGE_BASE_URL')?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return `${getPublicOrigin()}/gem-shards/images`
}

function getPublicOrigin(): string {
  const fromEnv = Deno.env.get('METADATA_PUBLIC_ORIGIN')?.trim()
    || Deno.env.get('VITE_APP_URL')?.trim()
  return (fromEnv || 'https://www.etn-nft-launchpad.club').replace(/\/$/, '')
}

function parseTokenId(req: Request): number | null {
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get('id') ?? url.searchParams.get('tokenId')
  if (fromQuery) {
    const parsed = Number(fromQuery)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  }

  const parts = url.pathname.split('/').filter(Boolean)
  const last = parts[parts.length - 1]
  if (!last) return null
  const cleaned = last.endsWith('.json') ? last.slice(0, -5) : last
  const parsed = Number(cleaned)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function fetchStaticMetadata(tokenId: number) {
  const response = await fetch(`${getMetadataBaseUrl()}/${tokenId}.json`)
  if (!response.ok) {
    throw new Error(`Static metadata not found for token ${tokenId}`)
  }
  return await response.json()
}

async function isGemShardsPublished(): Promise<boolean> {
  const forced = Deno.env.get('GEM_SHARDS_PUBLISHED')?.trim().toLowerCase()
  if (forced === 'true' || forced === '1') return true
  if (forced === 'false' || forced === '0') return false

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceKey) return false

  const chainId = Number(Deno.env.get('GEM_SHARDS_CHAIN_ID') ?? '52014')
  const statusKey = chainId === 5201420 ? 'gem_shards_status_testnet' : 'gem_shards_status_mainnet'

  const supabase = createClient(supabaseUrl, serviceKey)
  const { data } = await supabase.from('platform_config').select('value').eq('key', statusKey).maybeSingle()
  return data?.value === 'published'
}

function resolveImageUrl(imageField: string): string {
  if (!imageField) return ''
  if (imageField.startsWith('http://') || imageField.startsWith('https://')) {
    return imageField
  }
  const normalized = imageField.replace(/^\.?\//, '').replace(/^images\//, '')
  return `${getImageBaseUrl()}/${normalized}`
}

async function readPendingReward(tokenId: number): Promise<bigint> {
  const distributorAddress = Deno.env.get('GEM_SHARDS_DISTRIBUTOR_ADDRESS')?.trim()
  const rpcUrl = Deno.env.get('ELECTRONEUM_RPC_URL')?.trim()
    || Deno.env.get('VITE_ELECTRONEUM_RPC')?.trim()
    || 'https://rpc.ankr.com/electroneum'

  if (!distributorAddress) return 0n

  const client = createPublicClient({
    transport: http(rpcUrl),
  })

  return await client.readContract({
    address: distributorAddress as `0x${string}`,
    abi: DISTRIBUTOR_ABI,
    functionName: 'pendingReward',
    args: [BigInt(tokenId)],
  })
}

function withClaimableAttribute(metadata: Record<string, unknown>, claimableEtn: number) {
  const attributes = Array.isArray(metadata.attributes)
    ? metadata.attributes.filter(
      (attr) =>
        typeof attr === 'object'
        && attr !== null
        && (attr as { trait_type?: string }).trait_type !== 'Claimable ETN',
    )
    : []

  attributes.push({
    trait_type: 'Claimable ETN',
    display_type: 'number',
    value: claimableEtn,
  })

  return {
    ...metadata,
    attributes,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const tokenId = parseTokenId(req)
    if (!tokenId) {
      throw new Error('Missing or invalid token id')
    }

    const published = await isGemShardsPublished()
    if (!published) {
      return new Response(JSON.stringify({ error: 'Gem Shards not published yet' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const staticMetadata = await fetchStaticMetadata(tokenId)
    const pending = await readPendingReward(tokenId)
    const claimableEtn = Number(formatEther(pending))

    const metadata = withClaimableAttribute(
      {
        ...staticMetadata,
        image: resolveImageUrl(String(staticMetadata.image ?? '')),
      },
      claimableEtn,
    )

    return new Response(JSON.stringify(metadata), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=15',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
