import { getAbiItem, getAddress, parseEventLogs, type Log, type PublicClient } from 'viem'
import { getChainKey } from '@/lib/blockchain'
import { GEM_SHARDS_ABI, GEM_SHARDS_DEPLOY_BLOCK } from '@/lib/gem-shards'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
const LOG_CHUNK_SIZE = 500n

const SHARD_MINTED_EVENT = getAbiItem({ abi: GEM_SHARDS_ABI, name: 'ShardMinted' })
const TRANSFER_EVENT = getAbiItem({ abi: GEM_SHARDS_ABI, name: 'Transfer' })

type LogFilter = {
  address: `0x${string}`
  event: typeof SHARD_MINTED_EVENT | typeof TRANSFER_EVENT
  args?: Record<string, `0x${string}`>
}

function gemShardsDeployBlock(client: PublicClient): bigint {
  return GEM_SHARDS_DEPLOY_BLOCK[getChainKey(client.chain.id)]
}

/** Walk history in small block ranges so Electroneum RPC log limits are not hit. */
export async function getContractLogsChunked(
  client: PublicClient,
  filter: LogFilter,
  fromBlock?: bigint,
): Promise<Log[]> {
  const startBlock = fromBlock ?? gemShardsDeployBlock(client)
  const latest = await client.getBlockNumber()
  const logs: Log[] = []

  for (let start = startBlock; start <= latest; start += LOG_CHUNK_SIZE) {
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
  const fromBlock = gemShardsDeployBlock(client)
  const shardLogs = await getContractLogsChunked(client, {
    address: contractAddress,
    event: SHARD_MINTED_EVENT,
  }, fromBlock)

  if (shardLogs.length > 0) {
    const events = parseEventLogs({ abi: GEM_SHARDS_ABI, logs: shardLogs, eventName: 'ShardMinted' })
    return uniqueSortedTokenIds(events.map((event) => Number(event.args.tokenId)))
  }

  const transferLogs = await getContractLogsChunked(client, {
    address: contractAddress,
    event: TRANSFER_EVENT,
    args: { from: ZERO_ADDRESS },
  }, fromBlock)

  const events = parseEventLogs({ abi: GEM_SHARDS_ABI, logs: transferLogs, eventName: 'Transfer' })
  return uniqueSortedTokenIds(events.map((event) => Number(event.args.tokenId)))
}

/** Token IDs currently owned by a wallet — Transfer / ShardMinted logs from deploy block. */
export async function fetchGemShardOwnedTokenIds(
  client: PublicClient,
  contractAddress: `0x${string}`,
  owner: `0x${string}`,
): Promise<number[]> {
  const checksumOwner = getAddress(owner)
  const normalizedOwner = checksumOwner.toLowerCase()
  const fromBlock = gemShardsDeployBlock(client)

  const [incomingLogs, outgoingLogs, mintLogs] = await Promise.all([
    getContractLogsChunked(client, {
      address: contractAddress,
      event: TRANSFER_EVENT,
      args: { to: checksumOwner },
    }, fromBlock),
    getContractLogsChunked(client, {
      address: contractAddress,
      event: TRANSFER_EVENT,
      args: { from: checksumOwner },
    }, fromBlock),
    getContractLogsChunked(client, {
      address: contractAddress,
      event: SHARD_MINTED_EVENT,
      args: { to: checksumOwner },
    }, fromBlock),
  ])

  const ownership = new Map<number, string>()

  const mintEvents = parseEventLogs({ abi: GEM_SHARDS_ABI, logs: mintLogs, eventName: 'ShardMinted' })
  for (const event of mintEvents) {
    ownership.set(Number(event.args.tokenId), normalizedOwner)
  }

  const transferEvents = parseEventLogs({
    abi: GEM_SHARDS_ABI,
    logs: [...incomingLogs, ...outgoingLogs],
    eventName: 'Transfer',
  })

  for (const event of transferEvents) {
    const tokenId = Number(event.args.tokenId)
    const to = event.args.to?.toLowerCase()
    const from = event.args.from?.toLowerCase()

    if (to === normalizedOwner) ownership.set(tokenId, to)
    if (from === normalizedOwner) ownership.delete(tokenId)
  }

  return uniqueSortedTokenIds([...ownership.keys()])
}
