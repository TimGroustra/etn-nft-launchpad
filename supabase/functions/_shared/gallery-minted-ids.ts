import { Contract, JsonRpcProvider } from 'https://esm.sh/ethers@6.15.0'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const RPC_URL = Deno.env.get('ETN_RPC_URL') ?? 'https://rpc.ankr.com/electroneum'
const GEM_SHARDS_MAINNET = (
  Deno.env.get('GEM_SHARDS_ADDRESS_MAINNET') ?? '0x6cb09b4cb3d2dca90e720565c101500abe131001'
).toLowerCase()

const TS_ABI = ['function totalSupply() view returns (uint256)']
const GEM_SHARDS_EVENTS_ABI = [
  'event ShardMinted(uint256 indexed tokenId, address indexed to, bool freeMint)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]

const GEM_SHARDS_DEPLOY_BLOCK = 15_563_659
const LOG_CHUNK_SIZE = 500
const PARALLEL_CHUNK_BATCH = 15

export const GALLERY_MINTED_IDS_TTL_MS = 10 * 60 * 1000

function sameAddress(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase()
}

function uniqueSortedTokenIds(tokenIds: number[]): number[] {
  return [...new Set(tokenIds.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b)
}

async function queryShardMintedChunk(
  contract: Contract,
  start: number,
  end: number,
): Promise<number[]> {
  const ids: number[] = []
  try {
    const events = await contract.queryFilter(contract.filters.ShardMinted(), start, end)
    for (const event of events) {
      const tokenId = Number(event.args?.tokenId)
      if (Number.isInteger(tokenId) && tokenId > 0) ids.push(tokenId)
    }
  } catch {
    // Skip failed chunks instead of failing the whole request.
  }
  return ids
}

async function queryTransferMintChunk(
  contract: Contract,
  zeroAddress: string,
  start: number,
  end: number,
): Promise<number[]> {
  const ids: number[] = []
  try {
    const events = await contract.queryFilter(
      contract.filters.Transfer(zeroAddress, null, null),
      start,
      end,
    )
    for (const event of events) {
      const tokenId = Number(event.args?.tokenId)
      if (Number.isInteger(tokenId) && tokenId > 0) ids.push(tokenId)
    }
  } catch {
    // Skip failed chunks.
  }
  return ids
}

async function runChunksInParallel<T>(
  tasks: Array<() => Promise<T>>,
  batchSize: number,
  merge: (results: T[]) => T,
): Promise<T> {
  const merged: T[] = []
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize)
    const results = await Promise.all(batch.map((task) => task()))
    merged.push(...results)
  }
  return merge(merged)
}

export async function fetchGemShardMintedTokenIdsParallel(
  contractAddress: string,
): Promise<number[]> {
  const provider = new JsonRpcProvider(RPC_URL)
  const contract = new Contract(contractAddress, GEM_SHARDS_EVENTS_ABI, provider)
  const latest = await provider.getBlockNumber()

  const ranges: Array<{ start: number; end: number }> = []
  for (let start = GEM_SHARDS_DEPLOY_BLOCK; start <= latest; start += LOG_CHUNK_SIZE) {
    ranges.push({ start, end: Math.min(start + LOG_CHUNK_SIZE - 1, latest) })
  }

  const shardTasks = ranges.map(
    ({ start, end }) => () => queryShardMintedChunk(contract, start, end),
  )
  const shardChunks = await runChunksInParallel(shardTasks, PARALLEL_CHUNK_BATCH, (r) => r.flat())
  const tokenIds = new Set<number>(shardChunks)

  if (tokenIds.size > 0) {
    return uniqueSortedTokenIds([...tokenIds])
  }

  const zeroAddress = '0x0000000000000000000000000000000000000000'
  const transferTasks = ranges.map(
    ({ start, end }) => () => queryTransferMintChunk(contract, zeroAddress, start, end),
  )
  const transferChunks = await runChunksInParallel(transferTasks, PARALLEL_CHUNK_BATCH, (r) =>
    r.flat(),
  )
  return uniqueSortedTokenIds(transferChunks)
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

export async function fetchMintedTokenIdsOnChain(contractAddress: string): Promise<number[]> {
  if (sameAddress(contractAddress, GEM_SHARDS_MAINNET)) {
    return fetchGemShardMintedTokenIdsParallel(contractAddress)
  }

  const totalMinted = await fetchTotalSupply(contractAddress)
  if (totalMinted <= 0) return []
  return Array.from({ length: totalMinted }, (_, index) => index + 1)
}

export async function upsertContractMintedIds(
  supabase: SupabaseClient,
  contractAddress: string,
  mintedTokenIds: number[],
) {
  const contract = contractAddress.toLowerCase()
  const { error } = await supabase.from('gallery_contract_minted_ids').upsert({
    contract_address: contract,
    minted_token_ids: uniqueSortedTokenIds(mintedTokenIds),
    refreshed_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

export async function refreshContractMintedIds(
  supabase: SupabaseClient,
  contractAddress: string,
): Promise<number[]> {
  const ids = await fetchMintedTokenIdsOnChain(contractAddress)
  await upsertContractMintedIds(supabase, contractAddress, ids)
  return ids
}

export async function listGalleryContractAddresses(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data } = await supabase
    .from('gallery_config')
    .select('contract_address')
    .not('contract_address', 'is', null)

  return [
    ...new Set(
      (data ?? [])
        .map((row) => String(row.contract_address).trim())
        .filter((addr) => addr.length > 0),
    ),
  ]
}

export async function getStaleOrMissingContracts(
  supabase: SupabaseClient,
  contractAddresses: string[],
  ttlMs = GALLERY_MINTED_IDS_TTL_MS,
): Promise<string[]> {
  if (contractAddresses.length === 0) return []

  const normalized = contractAddresses.map((a) => a.toLowerCase())
  const { data } = await supabase
    .from('gallery_contract_minted_ids')
    .select('contract_address, refreshed_at')
    .in('contract_address', normalized)

  const fresh = new Map<string, number>()
  for (const row of data ?? []) {
    fresh.set(String(row.contract_address).toLowerCase(), Date.parse(String(row.refreshed_at)))
  }

  const staleBefore = Date.now() - ttlMs
  return normalized.filter((addr) => {
    const refreshedAt = fresh.get(addr)
    return refreshedAt == null || refreshedAt < staleBefore
  })
}

export async function refreshStaleGalleryContracts(
  supabase: SupabaseClient,
): Promise<{ refreshed: string[]; skipped: string[] }> {
  const contracts = await listGalleryContractAddresses(supabase)
  const stale = await getStaleOrMissingContracts(supabase, contracts)
  const refreshed: string[] = []

  await Promise.all(
    stale.map(async (contract) => {
      try {
        await refreshContractMintedIds(supabase, contract)
        refreshed.push(contract)
      } catch {
        // Best-effort per contract.
      }
    }),
  )

  const skipped = contracts.filter((c) => !refreshed.includes(c.toLowerCase()))
  return { refreshed, skipped }
}
