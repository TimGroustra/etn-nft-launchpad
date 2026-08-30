import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { Contract, JsonRpcProvider } from 'https://esm.sh/ethers@6.15.0'
import { getMetadataPublicOrigin } from './metadata-public-urls.ts'

const RPC_URL = Deno.env.get('ETN_RPC_URL') ?? 'https://rpc.ankr.com/electroneum'
const GEM_SHARDS_MAINNET = (
  Deno.env.get('GEM_SHARDS_ADDRESS_MAINNET') ?? '0x6cb09b4cb3d2dca90e720565c101500abe131001'
).toLowerCase()
const ELECTROGEMS_ADDRESS = (
  Deno.env.get('ELECTROGEMS_NFT_ADDRESS') ?? '0xcff0d88ed5311bab09178b6ec19a464100880984'
).toLowerCase()
const CLUB_WATCH_ADDRESS = (
  Deno.env.get('CLUB_WATCH_NFT_ADDRESS') ?? '0x9b852bd6965f050e9ab8eed4c900742b1d01fdd1'
).toLowerCase()
const BLOCKSCOUT_API = 'https://blockexplorer.electroneum.com/api/v2'
const BUCKET = 'gallery-cache'

const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://nftstorage.link/ipfs/',
  'https://dweb.link/ipfs/',
]

const ERC721 = ['function tokenURI(uint256) view returns (string)']
const ERC1155 = ['function uri(uint256) view returns (string)', 'function supportsInterface(bytes4) view returns (bool)']
const TS_ABI = ['function totalSupply() view returns (uint256)']
const GEM_SHARDS_EVENTS_ABI = [
  'event ShardMinted(uint256 indexed tokenId, address indexed to, bool freeMint)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]
const GEM_SHARDS_DEPLOY_BLOCK = 15_563_659
const LOG_CHUNK_SIZE = 500

export type ResolvedGalleryMedia = {
  title: string
  contentType: string
  sourceUrl: string
  bytes: Uint8Array
  extension: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sameAddress(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase()
}

function extractIpfsPath(url: string): string | null {
  const trimmed = url.trim()
  if (trimmed.startsWith('ipfs://')) return trimmed.replace(/^ipfs:\/\/(ipfs\/)?/, '')
  try {
    const match = new URL(trimmed).pathname.match(/\/ipfs\/(.+)$/i)
    return match ? match[1] : null
  } catch {
    return null
  }
}

function gatewayUrls(url: string): string[] {
  const ipfsPath = extractIpfsPath(url)
  if (!ipfsPath) return [url]
  return IPFS_GATEWAYS.map((g) => `${g}${ipfsPath}`)
}

function hex64(id: number): string {
  const hex = BigInt(id).toString(16).padStart(64, '0').toLowerCase()
  return hex
}

function extensionFromContentType(contentType: string, sourceUrl: string): string {
  const lower = contentType.toLowerCase()
  if (lower.includes('png')) return 'png'
  if (lower.includes('webp')) return 'webp'
  if (lower.includes('gif')) return 'gif'
  if (lower.includes('svg')) return 'svg'
  if (lower.includes('video') || lower.includes('mp4')) return 'mp4'
  const path = sourceUrl.toLowerCase().split('?')[0].split('#')[0]
  const match = path.match(/\.([a-z0-9]+)$/)
  if (match) return match[1]
  return 'jpg'
}

async function fetchBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  for (const candidate of gatewayUrls(url)) {
    try {
      const res = await fetch(candidate)
      if (!res.ok) continue
      const contentType = res.headers.get('content-type') || 'application/octet-stream'
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.length === 0) continue
      return { bytes, contentType }
    } catch {
      // try next gateway
    }
  }
  return null
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  for (const candidate of gatewayUrls(url)) {
    try {
      const res = await fetch(candidate)
      if (!res.ok) continue
      return (await res.json()) as Record<string, unknown>
    } catch {
      // try next
    }
  }
  return null
}

function parseMediaFields(meta: Record<string, unknown>, baseUri?: string) {
  const image =
    (meta.image as string | undefined) ??
    (meta.image_url as string | undefined) ??
    (meta.animation_url as string | undefined) ??
    (meta.animationURL as string | undefined)

  function resolve(u?: string) {
    if (!u) return null
    if (u.startsWith('data:')) return u
    if (u.startsWith('http') || u.startsWith('ipfs://')) {
      const ipfsPath = extractIpfsPath(u)
      if (ipfsPath) return gatewayUrls(u)[0]
      return u
    }
    if (baseUri) return `${baseUri.replace(/\/?$/, '/')}${u.replace(/^\//, '')}`
    return u
  }

  return {
    title: (meta.name as string) || `Token`,
    mediaUrl: resolve(image),
  }
}

async function resolveFromBlockscout(contract: string, tokenId: number) {
  const res = await fetch(`${BLOCKSCOUT_API}/tokens/${contract}/instances/${tokenId}`)
  if (!res.ok) return null
  const data = (await res.json()) as { metadata?: Record<string, unknown> }
  if (!data.metadata) return null
  const { title, mediaUrl } = parseMediaFields(data.metadata)
  if (!mediaUrl) return null
  const downloaded = await fetchBytes(mediaUrl)
  if (!downloaded) return null
  return {
    title,
    contentType: downloaded.contentType,
    sourceUrl: mediaUrl,
    bytes: downloaded.bytes,
    extension: extensionFromContentType(downloaded.contentType, mediaUrl),
  } satisfies ResolvedGalleryMedia
}

async function resolveGemShard(
  supabase: SupabaseClient,
  tokenId: number,
): Promise<ResolvedGalleryMedia | null> {
  const fileName = `${String(tokenId).padStart(3, '0')}.png`
  const sourcePath = `images/${fileName}`
  const { data, error } = await supabase.storage.from('gem-shards').download(sourcePath)
  if (error || !data) {
    const origin = getMetadataPublicOrigin()
    const fallbackUrl = `${origin}/gem-shards/images/${fileName}`
    const downloaded = await fetchBytes(fallbackUrl)
    if (!downloaded) return null
    return {
      title: `Gem Shard #${tokenId}`,
      contentType: downloaded.contentType,
      sourceUrl: fallbackUrl,
      bytes: downloaded.bytes,
      extension: 'png',
    }
  }
  const bytes = new Uint8Array(await data.arrayBuffer())
  return {
    title: `Gem Shard #${tokenId}`,
    contentType: 'image/png',
    sourceUrl: `gem-shards/${sourcePath}`,
    bytes,
    extension: 'png',
  }
}

async function resolveFromChain(contract: string, tokenId: number): Promise<ResolvedGalleryMedia | null> {
  const provider = new JsonRpcProvider(RPC_URL)
  const c = new Contract(contract, [...ERC721, ...ERC1155], provider)
  let rawUri = ''
  try {
    const is1155 = Boolean(await c.supportsInterface('0xd9b67a26'))
    rawUri = is1155
      ? String(await c.uri(tokenId))
      : String(await c.tokenURI(tokenId))
  } catch {
    try {
      rawUri = String(await c.tokenURI(tokenId))
    } catch {
      return null
    }
  }

  if (!rawUri) return null
  if (rawUri.includes('{id}')) rawUri = rawUri.replace('{id}', hex64(tokenId))

  let meta: Record<string, unknown> | null = null
  if (rawUri.startsWith('data:application/json;base64,')) {
    meta = JSON.parse(atob(rawUri.split(',')[1])) as Record<string, unknown>
  } else {
    const normalized = gatewayUrls(rawUri)[0]
    meta = await fetchJson(normalized)
  }

  const { title, mediaUrl } = meta
    ? parseMediaFields(meta, gatewayUrls(rawUri)[0])
    : { title: `Token #${tokenId}`, mediaUrl: gatewayUrls(rawUri)[0] }

  if (!mediaUrl) return null
  const downloaded = await fetchBytes(mediaUrl)
  if (!downloaded) return null

  return {
    title,
    contentType: downloaded.contentType,
    sourceUrl: mediaUrl,
    bytes: downloaded.bytes,
    extension: extensionFromContentType(downloaded.contentType, mediaUrl),
  }
}

export async function resolveGalleryMedia(
  supabase: SupabaseClient,
  contractAddress: string,
  tokenId: number,
): Promise<ResolvedGalleryMedia | null> {
  const contract = contractAddress.toLowerCase()

  if (sameAddress(contract, GEM_SHARDS_MAINNET)) {
    return await resolveGemShard(supabase, tokenId)
  }
  // Blockscout indexes stale Supabase image URLs for ElectroGems; on-chain IPFS metadata is correct.
  if (sameAddress(contract, CLUB_WATCH_ADDRESS)) {
    const fromExplorer = await resolveFromBlockscout(contract, tokenId)
    if (fromExplorer) return fromExplorer
  }

  if (sameAddress(contract, ELECTROGEMS_ADDRESS)) {
    const fromChain = await resolveFromChain(contract, tokenId)
    if (fromChain) return fromChain
    const fromExplorer = await resolveFromBlockscout(contract, tokenId)
    if (fromExplorer) return fromExplorer
    return null
  }

  return await resolveFromChain(contract, tokenId)
}

export function galleryStoragePath(contractAddress: string, tokenId: number, extension: string) {
  return `${contractAddress.toLowerCase()}/${tokenId}.${extension}`
}

export async function cacheGalleryMedia(
  supabase: SupabaseClient,
  contractAddress: string,
  tokenId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const contract = contractAddress.toLowerCase()

  const { data: existing } = await supabase
    .from('gallery_media_cache')
    .select('storage_path')
    .eq('contract_address', contract)
    .eq('token_id', tokenId)
    .maybeSingle()

  if (existing?.storage_path) {
    await supabase
      .from('gallery_cache_queue')
      .update({ status: 'done', updated_at: new Date().toISOString(), last_error: null })
      .eq('contract_address', contract)
      .eq('token_id', tokenId)
    return { ok: true }
  }

  const resolved = await resolveGalleryMedia(supabase, contract, tokenId)
  if (!resolved) return { ok: false, error: 'Could not resolve media' }

  const storagePath = galleryStoragePath(contract, tokenId, resolved.extension)
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(
    storagePath,
    resolved.bytes,
    { contentType: resolved.contentType, upsert: true },
  )
  if (uploadError) return { ok: false, error: uploadError.message }

  const { error: cacheError } = await supabase.from('gallery_media_cache').upsert({
    contract_address: contract,
    token_id: tokenId,
    title: resolved.title,
    content_type: resolved.contentType,
    storage_path: storagePath,
    source_url: resolved.sourceUrl,
    cached_at: new Date().toISOString(),
  })
  if (cacheError) return { ok: false, error: cacheError.message }

  await supabase
    .from('gallery_cache_queue')
    .update({ status: 'done', updated_at: new Date().toISOString(), last_error: null })
    .eq('contract_address', contract)
    .eq('token_id', tokenId)

  return { ok: true }
}

export async function enqueueGalleryTokens(
  supabase: SupabaseClient,
  contractAddress: string,
  tokenIds: number[],
) {
  const contract = contractAddress.toLowerCase()
  const uniqueIds = [...new Set(tokenIds.filter((id) => Number.isInteger(id) && id > 0))]
  if (uniqueIds.length === 0) return

  for (const tokenId of uniqueIds) {
    const { data: cached } = await supabase
      .from('gallery_media_cache')
      .select('storage_path')
      .eq('contract_address', contract)
      .eq('token_id', tokenId)
      .maybeSingle()
    if (cached?.storage_path) continue

    const { data: queued } = await supabase
      .from('gallery_cache_queue')
      .select('status')
      .eq('contract_address', contract)
      .eq('token_id', tokenId)
      .maybeSingle()

    if (queued?.status === 'failed') {
      await supabase
        .from('gallery_cache_queue')
        .update({
          status: 'pending',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('contract_address', contract)
        .eq('token_id', tokenId)
      continue
    }

    if (
      queued?.status === 'done' ||
      queued?.status === 'pending' ||
      queued?.status === 'processing'
    ) {
      continue
    }

    await supabase.from('gallery_cache_queue').upsert(
      {
        contract_address: contract,
        token_id: tokenId,
        status: 'pending',
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'contract_address,token_id' },
    )
  }
}

export async function fetchTotalSupply(contractAddress: string): Promise<number> {
  try {
    const provider = new JsonRpcProvider(RPC_URL)
    const contract = new Contract(contractAddress, TS_ABI, provider)
    const value = await contract.totalSupply()
    return Math.max(0, Number(value))
  } catch {
    return 0
  }
}

async function fetchGemShardMintedTokenIds(contractAddress: string): Promise<number[]> {
  const provider = new JsonRpcProvider(RPC_URL)
  const contract = new Contract(contractAddress, GEM_SHARDS_EVENTS_ABI, provider)
  const latest = await provider.getBlockNumber()
  const tokenIds = new Set<number>()

  for (let start = GEM_SHARDS_DEPLOY_BLOCK; start <= latest; start += LOG_CHUNK_SIZE) {
    const end = Math.min(start + LOG_CHUNK_SIZE - 1, latest)
    try {
      const events = await contract.queryFilter(contract.filters.ShardMinted(), start, end)
      for (const event of events) {
        const tokenId = Number(event.args?.tokenId)
        if (Number.isInteger(tokenId) && tokenId > 0) tokenIds.add(tokenId)
      }
    } catch {
      // Skip failed chunks instead of failing the whole request.
    }
  }

  if (tokenIds.size > 0) {
    return [...tokenIds].sort((a, b) => a - b)
  }

  const zeroAddress = '0x0000000000000000000000000000000000000000'
  for (let start = GEM_SHARDS_DEPLOY_BLOCK; start <= latest; start += LOG_CHUNK_SIZE) {
    const end = Math.min(start + LOG_CHUNK_SIZE - 1, latest)
    try {
      const events = await contract.queryFilter(contract.filters.Transfer(zeroAddress, null, null), start, end)
      for (const event of events) {
        const tokenId = Number(event.args?.tokenId)
        if (Number.isInteger(tokenId) && tokenId > 0) tokenIds.add(tokenId)
      }
    } catch {
      // Skip failed chunks instead of failing the whole request.
    }
  }

  return [...tokenIds].sort((a, b) => a - b)
}

async function fetchMintedTokenIds(contractAddress: string): Promise<number[]> {
  if (sameAddress(contractAddress, GEM_SHARDS_MAINNET)) {
    return fetchGemShardMintedTokenIds(contractAddress)
  }

  const totalMinted = await fetchTotalSupply(contractAddress)
  if (totalMinted <= 0) return []
  return Array.from({ length: totalMinted }, (_, index) => index + 1)
}

export async function tokenIdsForPanel(
  contractAddress: string,
  defaultTokenId: number,
  showCollection: boolean,
  maxCollectionTokens = 40,
): Promise<number[]> {
  const mintedTokenIds = (await fetchMintedTokenIds(contractAddress)).slice(0, maxCollectionTokens)
  if (mintedTokenIds.length === 0) return []

  if (!showCollection) {
    const pinnedId = Math.max(1, defaultTokenId)
    return mintedTokenIds.includes(pinnedId) ? [pinnedId] : []
  }

  return mintedTokenIds
}

export const GALLERY_CACHE_BATCH_SIZE = 2
export const GALLERY_CACHE_ITEM_DELAY_MS = 600
/** Pause between chained batches so warmup stays gentle on RPC/IPFS. */
export const GALLERY_CACHE_BATCH_DELAY_MS = 3_000

export async function processGalleryCacheBatch(supabase: SupabaseClient) {
  // Recover jobs left in processing if a prior edge invocation timed out.
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString()
  await supabase
    .from('gallery_cache_queue')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('status', 'processing')
    .lt('updated_at', staleBefore)

  const { data: jobs } = await supabase
    .from('gallery_cache_queue')
    .select('id, contract_address, token_id, attempts')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(GALLERY_CACHE_BATCH_SIZE)

  if (!jobs?.length) return { processed: 0, remaining: 0 }

  let processed = 0
  for (const job of jobs) {
    await supabase
      .from('gallery_cache_queue')
      .update({
        status: 'processing',
        attempts: (job.attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    const result = await cacheGalleryMedia(supabase, job.contract_address, job.token_id)
    if (!result.ok) {
      const attempts = (job.attempts ?? 0) + 1
      await supabase
        .from('gallery_cache_queue')
        .update({
          status: attempts >= 3 ? 'failed' : 'pending',
          last_error: result.error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
    } else {
      processed++
    }

    await sleep(GALLERY_CACHE_ITEM_DELAY_MS)
  }

  const { count } = await supabase
    .from('gallery_cache_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  return { processed, remaining: count ?? 0 }
}

export async function triggerGalleryCacheTick(
  supabaseUrl: string,
  serviceKey: string,
  delayMs = GALLERY_CACHE_BATCH_DELAY_MS,
) {
  if (delayMs > 0) await sleep(delayMs)
  try {
    await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/gallery-cache-tick`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
  } catch {
    // best-effort background kick
  }
}
