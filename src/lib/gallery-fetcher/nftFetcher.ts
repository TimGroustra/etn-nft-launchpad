import { JsonRpcProvider, Contract } from 'ethers'
import { CLUB_WATCH_NFT_ADDRESS, ELECTROGEMS_NFT_ADDRESS } from '@/lib/creator-access'
import { fetchGemShardDisplayInfo } from '@/lib/gem-shards'
import { getCachedGalleryMetadata } from '@/lib/gallery-cache'
import { safeCall } from './ethersSafe'
import { getGatewayCandidates, normalizeUrl, hex64 } from './urlUtils'

const RPC_URL = 'https://rpc.ankr.com/electroneum'
const provider = new JsonRpcProvider(RPC_URL)

const GEM_SHARDS_MAINNET = '0x6cb09b4cb3d2dca90e720565c101500abe131001'
const BLOCKSCOUT_API = 'https://blockexplorer.electroneum.com/api/v2'

const ERC165 = ['function supportsInterface(bytes4) view returns (bool)']
const ERC721 = ['function tokenURI(uint256) view returns (string)']
const ERC1155 = ['function uri(uint256) view returns (string)']
const TS_ABI = ['function totalSupply() view returns (uint256)']

export interface NftSource {
  contractAddress: string
  tokenId: number
}

export interface NftAttribute {
  trait_type: string
  value: string | number
}

export interface NftMetadata {
  title: string
  description: string
  contentUrl: string
  contentType: string
  source: string
  attributes?: NftAttribute[]
}

export type NftMetadataResult =
  | { ok: true; metadata: NftMetadata }
  | { ok: false; reason: string; error?: string }

let activeFetches = 0
const MAX_CONCURRENT = 4
const waitQueue: Array<() => void> = []

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

async function acquireSlot(): Promise<void> {
  if (activeFetches < MAX_CONCURRENT) {
    activeFetches++
    return
  }
  await new Promise<void>((resolve) => waitQueue.push(resolve))
  activeFetches++
}

function releaseSlot() {
  activeFetches--
  const next = waitQueue.shift()
  if (next) next()
}

async function retry<T>(fn: () => Promise<T>, retries = 3, initialDelay = 800): Promise<T> {
  let attempt = 0
  while (attempt < retries) {
    try {
      return await fn()
    } catch (e) {
      attempt++
      if (attempt >= retries) throw e
      await new Promise((r) => setTimeout(r, initialDelay * Math.pow(2, attempt)))
    }
  }
  throw new Error('Retry exhausted')
}

async function fetchJsonFromCandidates(url: string): Promise<Record<string, unknown> | null> {
  for (const candidate of getGatewayCandidates(url)) {
    try {
      const res = await fetch(candidate)
      if (!res.ok) continue
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json') || candidate.toLowerCase().endsWith('.json')) {
        return (await res.json()) as Record<string, unknown>
      }
    } catch {
      // try next gateway
    }
  }
  return null
}

async function parseMetadataObject(meta: Record<string, unknown>, baseUri?: string) {
  const getField = (k: string) =>
    (meta[k] as string | undefined) ??
    ((meta.properties as Record<string, unknown> | undefined)?.[k] as string | undefined) ??
    null

  const animation =
    (meta.animation_url as string | undefined) ??
    (meta.animationURL as string | undefined) ??
    getField('animation_url')
  const image =
    (meta.image as string | undefined) ??
    (meta.image_url as string | undefined) ??
    (meta.imageURL as string | undefined)

  function resolveUrl(u?: string | null) {
    if (!u) return null
    if (u.startsWith('http') || u.startsWith('ipfs://') || u.startsWith('data:')) return normalizeUrl(u)
    if (baseUri) return normalizeUrl(baseUri.replace(/\/?$/, '/') + u.replace(/^\//, ''))
    return u
  }

  const animationUrl = resolveUrl(animation)
  const imageUrl = resolveUrl(image)
  const contentUrl = animationUrl ?? imageUrl ?? ''
  let contentType = 'image/unknown'

  if (contentUrl) {
    const urlLower = contentUrl.toLowerCase().split('?')[0].split('#')[0]
    if (urlLower.match(/\.(mp4|webm|ogg|mov)$/)) contentType = 'video/mp4'
    else if (urlLower.match(/\.gif$/)) contentType = 'image/gif'
    else if (urlLower.match(/\.(png|jpg|jpeg|webp|svg)$/)) contentType = 'image/jpeg'
  }

  return {
    title: (meta.name as string) || '(No Title)',
    description: (meta.description as string) || '(No description)',
    contentUrl,
    contentType,
    attributes: (meta.attributes as NftAttribute[]) || [],
  }
}

async function fetchGemShardGalleryMetadata(tokenId: number): Promise<NftMetadata | null> {
  try {
    const info = await fetchGemShardDisplayInfo(tokenId)
    return {
      title: info.name,
      description: `Gem Shard #${tokenId}`,
      contentUrl: info.imageUrl,
      contentType: 'image/png',
      source: info.imageUrl,
    }
  } catch {
    return null
  }
}

async function fetchBlockscoutMetadata(
  contractAddress: string,
  tokenId: number,
): Promise<NftMetadata | null> {
  try {
    const res = await fetch(
      `${BLOCKSCOUT_API}/tokens/${contractAddress}/instances/${tokenId}`,
    )
    if (!res.ok) return null
    const data = (await res.json()) as { metadata?: Record<string, unknown> }
    if (!data.metadata) return null
    const parsed = await parseMetadataObject(data.metadata)
    if (!parsed.contentUrl) return null
    return {
      ...parsed,
      source: `${BLOCKSCOUT_API}/tokens/${contractAddress}/instances/${tokenId}`,
    }
  } catch {
    return null
  }
}

export async function fetchNftMetadata(contractAddress: string, tokenId: number): Promise<NftMetadataResult> {
  if (!contractAddress || tokenId === undefined) return { ok: false, reason: 'invalid_input' }

  await acquireSlot()
  try {
    const cached = await getCachedGalleryMetadata(contractAddress, tokenId)
    if (cached) return { ok: true, metadata: cached }

    if (sameAddress(contractAddress, GEM_SHARDS_MAINNET)) {
      const metadata = await fetchGemShardGalleryMetadata(tokenId)
      if (metadata) return { ok: true, metadata }
    }

    // Blockscout serves stale Supabase image URLs for ElectroGems; prefer on-chain IPFS metadata.
    if (sameAddress(contractAddress, CLUB_WATCH_NFT_ADDRESS)) {
      const metadata = await fetchBlockscoutMetadata(contractAddress, tokenId)
      if (metadata) return { ok: true, metadata }
    }

    const contract = new Contract(contractAddress, [...ERC165, ...ERC721, ...ERC1155], provider)
    const supportRes = await retry(() => safeCall(contract, 'supportsInterface', ['0xd9b67a26']))
    const is1155 = supportRes.ok && !!supportRes.value

    const uriRes = is1155
      ? await retry(() => safeCall(contract, 'uri', [tokenId]))
      : await retry(() => safeCall(contract, 'tokenURI', [tokenId]))

    if (!uriRes.ok) return { ok: false, reason: 'uri_failed', error: uriRes.error }

    let rawUri = uriRes.value as string
    if (!rawUri) return { ok: false, reason: 'empty_uri' }

    if (is1155 && rawUri.includes('{id}')) {
      rawUri = rawUri.replace('{id}', hex64(tokenId))
    }

    const metadataUrl = normalizeUrl(rawUri)
    let meta: Record<string, unknown> | null = null

    if (metadataUrl.startsWith('data:application/json;base64,')) {
      meta = JSON.parse(atob(metadataUrl.split(',')[1])) as Record<string, unknown>
    } else {
      meta = await fetchJsonFromCandidates(rawUri)
    }

    if (meta) {
      const parsed = await parseMetadataObject(meta, metadataUrl)
      return { ok: true, metadata: { ...parsed, source: metadataUrl } }
    }

    const parsed = await parseMetadataObject({ image: rawUri }, metadataUrl)
    return { ok: true, metadata: { ...parsed, source: metadataUrl } }
  } catch (e) {
    return { ok: false, reason: 'exception', error: e instanceof Error ? e.message : String(e) }
  } finally {
    releaseSlot()
  }
}

export async function fetchTotalSupply(contractAddress: string): Promise<number | null> {
  if (!contractAddress) return null
  try {
    const contract = new Contract(contractAddress, TS_ABI, provider)
    const res = await retry(() => safeCall(contract, 'totalSupply', []), 2)
    if (res.ok) return Number(res.value)
    return null
  } catch {
    return null
  }
}
