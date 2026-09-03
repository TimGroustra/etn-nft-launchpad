import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { Contract, JsonRpcProvider } from 'https://esm.sh/ethers@6.15.0'
import { getMetadataPublicOrigin } from './metadata-public-urls.ts'
import {
  fetchMintedTokenIdsOnChain,
  getMintedTokenIdsForGallery,
  refreshStaleGalleryContracts,
} from './gallery-minted-ids.ts'

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

async function fetchMintedTokenIds(
  contractAddress: string,
  supabase?: SupabaseClient,
): Promise<number[]> {
  if (supabase) return getMintedTokenIdsForGallery(supabase, contractAddress)
  return fetchMintedTokenIdsOnChain(contractAddress)
}

export async function tokenIdsForPanel(
  contractAddress: string,
  defaultTokenId: number,
  showCollection: boolean,
  maxCollectionTokens = 40,
  _panelKey?: string,
  supabase?: SupabaseClient,
): Promise<number[]> {
  const mintedTokenIds = (await fetchMintedTokenIds(contractAddress, supabase)).slice(0, maxCollectionTokens)
  if (mintedTokenIds.length === 0) return []

  const pinnedId = Math.max(1, defaultTokenId)
  if (!showCollection) {
    return mintedTokenIds.includes(pinnedId) ? [pinnedId] : []
  }

  return mintedTokenIds
}

export const GALLERY_CACHE_BATCH_SIZE = 3
export const GALLERY_CACHE_ITEM_DELAY_MS = 0

type PanelTokenRow = {
  panel_key: string
  contract_address: string
  token_id: number
}

/** Token shown in the panel editor preview and as the panel's initial gallery display. */
export function resolvePanelDisplayTokenId(
  defaultTokenId: number,
  showCollection: boolean,
  tokenIds: number[],
): number | null {
  if (tokenIds.length === 0) return null
  const pinnedId = Math.max(1, defaultTokenId)
  if (showCollection) {
    return tokenIds.includes(pinnedId) ? pinnedId : tokenIds[0]
  }
  return tokenIds[0]
}

async function collectConfiguredGalleryTokenKeys(
  supabase: SupabaseClient,
  scopeRoomId?: string | null,
): Promise<Set<string>> {
  const keys = new Set<string>()

  let configQuery = supabase
    .from('gallery_config')
    .select('contract_address, default_token_id, show_collection, room_id')
    .not('contract_address', 'is', null)

  if (scopeRoomId) {
    configQuery = configQuery.eq('room_id', scopeRoomId)
  }

  const { data: configRows } = await configQuery

  const contracts = [
    ...new Set(
      (configRows ?? [])
        .map((row) => String(row.contract_address).toLowerCase())
        .filter(Boolean),
    ),
  ]

  const mintedByContract = new Map<string, number[]>()
  if (contracts.length > 0) {
    const { data: mintedRows } = await supabase
      .from('gallery_contract_minted_ids')
      .select('contract_address, minted_token_ids')
      .in('contract_address', contracts)

    for (const row of mintedRows ?? []) {
      const contract = String(row.contract_address).toLowerCase()
      const ids = (row.minted_token_ids ?? []) as number[]
      if (ids.length > 0) mintedByContract.set(contract, ids)
    }
  }

  for (const row of configRows ?? []) {
    const contract = String(row.contract_address).toLowerCase()
    const defaultTokenId = Math.max(1, Number(row.default_token_id) || 1)
    const showCollection = Boolean(row.show_collection)

    if (showCollection) {
      const minted = mintedByContract.get(contract) ?? []
      for (const tokenId of minted.slice(0, 40)) {
        keys.add(`${contract}:${tokenId}`)
      }
      if (minted.length === 0) keys.add(`${contract}:${defaultTokenId}`)
      continue
    }

    keys.add(`${contract}:${defaultTokenId}`)
  }

  let panelQuery = supabase.from('gallery_panel_tokens').select('contract_address, token_id, room_id')
  if (scopeRoomId) {
    panelQuery = panelQuery.eq('room_id', scopeRoomId)
  }

  const { data: panelRows } = await panelQuery

  for (const row of panelRows ?? []) {
    keys.add(`${String(row.contract_address).toLowerCase()}:${Number(row.token_id)}`)
  }

  return keys
}

/** Resolve and persist display tokens from gallery_config (no on-chain lookups). */
export async function syncGalleryPanelTokens(supabase: SupabaseClient, roomId?: string | null) {
  let query = supabase
    .from('gallery_config')
    .select('panel_key, contract_address, default_token_id, room_id')
    .not('contract_address', 'is', null)

  if (roomId) {
    query = query.eq('room_id', roomId)
  } else {
    query = query.is('room_id', null)
  }

  const { data: rows } = await query

  if (!rows?.length) {
    if (roomId) {
      await supabase.from('gallery_panel_tokens').delete().eq('room_id', roomId)
    } else {
      await supabase.from('gallery_panel_tokens').delete().is('room_id', null)
    }
    return { synced: 0 }
  }

  const panelTokens: PanelTokenRow[] = rows.map((row) => ({
    panel_key: String(row.panel_key),
    contract_address: String(row.contract_address).toLowerCase(),
    token_id: Math.max(1, Number(row.default_token_id) || 1),
  }))

  if (panelTokens.length === 0) {
    return { synced: 0, skipped: true }
  }

  if (roomId) {
    await supabase.from('gallery_panel_tokens').delete().eq('room_id', roomId)
  } else {
    await supabase.from('gallery_panel_tokens').delete().is('room_id', null)
  }

  const { error } = await supabase.from('gallery_panel_tokens').upsert(
    panelTokens.map((row) => ({
      panel_key: row.panel_key,
      room_id: roomId ?? null,
      contract_address: row.contract_address,
      token_id: row.token_id,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'panel_key' },
  )
  if (error) throw new Error(error.message)

  return { synced: panelTokens.length }
}

/** Remove cached media that is no longer referenced by any gallery panel token. */
export async function pruneOrphanedGalleryMedia(
  supabase: SupabaseClient,
  scopeRoomId?: string | null,
) {
  const activeKeys = await collectConfiguredGalleryTokenKeys(supabase, scopeRoomId)

  // Panel index not ready yet — never wipe cache while gallery_config still has panels.
  if (activeKeys.size === 0) {
    const { count } = await supabase
      .from('gallery_config')
      .select('panel_key', { count: 'exact', head: true })
      .not('contract_address', 'is', null)
    if ((count ?? 0) > 0) return { removed: 0, skipped: true }
  }

  const { data: cachedRows } = await supabase
    .from('gallery_media_cache')
    .select('contract_address, token_id, storage_path')

  const orphans = (cachedRows ?? []).filter((row) => {
    const key = `${String(row.contract_address).toLowerCase()}:${Number(row.token_id)}`
    return !activeKeys.has(key)
  })

  let removed = 0
  for (const row of orphans) {
    const contract = String(row.contract_address).toLowerCase()
    const tokenId = Number(row.token_id)
    const storagePath = String(row.storage_path ?? '')

    if (storagePath) {
      await supabase.storage.from(BUCKET).remove([storagePath])
    }

    await supabase
      .from('gallery_media_cache')
      .delete()
      .eq('contract_address', contract)
      .eq('token_id', tokenId)

    await supabase
      .from('gallery_cache_queue')
      .delete()
      .eq('contract_address', contract)
      .eq('token_id', tokenId)

    removed++
  }

  return { removed }
}

/** Enqueue all configured panel tokens for background media warming. */
export async function enqueueGalleryPanelsFromConfig(supabase: SupabaseClient) {
  await syncGalleryPanelTokens(supabase)

  const { data: panelRows } = await supabase
    .from('gallery_panel_tokens')
    .select('contract_address, token_id')

  if (!panelRows?.length) return { enqueued: 0 }

  const tokenIdsByContract = new Map<string, Set<number>>()
  for (const row of panelRows) {
    const contract = String(row.contract_address).toLowerCase()
    const tokenId = Number(row.token_id)
    if (!tokenIdsByContract.has(contract)) tokenIdsByContract.set(contract, new Set())
    tokenIdsByContract.get(contract)!.add(tokenId)
  }

  let enqueued = 0
  for (const [contract, ids] of tokenIdsByContract) {
    await enqueueGalleryTokens(supabase, contract, [...ids])
    enqueued += ids.size
  }

  return { enqueued }
}

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

export { refreshStaleGalleryContracts }

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
