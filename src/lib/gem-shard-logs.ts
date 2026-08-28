import { getAbiItem, parseEventLogs, type Log, type PublicClient } from 'viem'
import { GEM_SHARDS_ABI, GEM_SHARDS_MAX_SUPPLY } from '@/lib/gem-shards'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
const LOG_CHUNK_SIZE = 10_000n

const SHARD_MINTED_EVENT = getAbiItem({ abi: GEM_SHARDS_ABI, name: 'ShardMinted' })
const TRANSFER_EVENT = getAbiItem({ abi: GEM_SHARDS_ABI, name: 'Transfer' })

type LogFilter = {
  address: `0x${string}`
  event: typeof SHARD_MINTED_EVENT | typeof TRANSFER_EVENT
  args?: Record<string, `0x${string}`>
}

/** Walk history in small block ranges so Electroneum RPC log limits are not hit. */
export async function getContractLogsChunked(
  client: PublicClient,
  filter: LogFilter,
  fromBlock = 0n,
): Promise<Log[]> {
  const latest = await client.getBlockNumber()
  const logs: Log[] = []

  for (let start = fromBlock; start <= latest; start += LOG_CHUNK_SIZE) {
    const end = start + LOG_CHUNK_SIZE - 1n > latest ? latest : start + LOG_CHUNK_SIZE - 1n
    try {
      const chunk = await client.getLogs({
        ...filter,
        fromBlock: start,
        toBlock: end,
      })
      logs.push(...chunk)
    } catch {
      // Skip failed chunks instead of failing the whole request.
    }
  }

  return logs
}

function uniqueSortedTokenIds(tokenIds: number[]): number[] {
  return [...new Set(tokenIds)].sort((a, b) => a - b)
}

/** All minted shard IDs from ShardMinted / mint Transfer logs. */
export async function fetchGemShardMintedTokenIds(
  client: PublicClient,
  contractAddress: `0x${string}`,
): Promise<number[]> {
  const shardLogs = await getContractLogsChunked(client, {
    address: contractAddress,
    event: SHARD_MINTED_EVENT,
  })

  if (shardLogs.length > 0) {
    const events = parseEventLogs({ abi: GEM_SHARDS_ABI, logs: shardLogs, eventName: 'ShardMinted' })
    return uniqueSortedTokenIds(events.map((event) => Number(event.args.tokenId)))
  }

  const transferLogs = await getContractLogsChunked(client, {
    address: contractAddress,
    event: TRANSFER_EVENT,
    args: { from: ZERO_ADDRESS },
  })

  const events = parseEventLogs({ abi: GEM_SHARDS_ABI, logs: transferLogs, eventName: 'Transfer' })
  return uniqueSortedTokenIds(events.map((event) => Number(event.args.tokenId)))
}

/** Token IDs currently owned by a wallet — ownerOf scan over the full 1..495 ID space (random mint). */
export async function fetchGemShardOwnedTokenIds(
  client: PublicClient,
  contractAddress: `0x${string}`,
  owner: `0x${string}`,
): Promise<number[]> {
  const normalizedOwner = owner.toLowerCase()

  const ownerResults = await client.multicall({
    contracts: Array.from({ length: GEM_SHARDS_MAX_SUPPLY }, (_, index) => ({
      address: contractAddress,
      abi: GEM_SHARDS_ABI,
      functionName: 'ownerOf' as const,
      args: [BigInt(index + 1)],
    })),
    allowFailure: true,
  })

  const owned: number[] = []
  for (let index = 0; index < GEM_SHARDS_MAX_SUPPLY; index++) {
    const result = ownerResults[index]
    if (result.status === 'success' && result.result.toLowerCase() === normalizedOwner) {
      owned.push(index + 1)
    }
  }

  return owned
}
