import { getAbiItem, parseEventLogs, type PublicClient } from 'viem'
import { NFT_ABI } from '@/lib/blockchain'
import { GEM_SHARDS_ABI } from '@/lib/gem-shards'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

const SHARD_MINTED_EVENT = getAbiItem({ abi: GEM_SHARDS_ABI, name: 'ShardMinted' })
const TRANSFER_EVENT = getAbiItem({ abi: GEM_SHARDS_ABI, name: 'Transfer' })
const PUBLIC_MINT_ASSIGNED_EVENT = getAbiItem({ abi: NFT_ABI, name: 'PublicMintAssigned' })

/** One getLogs call — O(mints), not O(max supply). */
export async function fetchGemShardMintedTokenIds(
  client: PublicClient,
  contractAddress: `0x${string}`,
): Promise<number[]> {
  const shardLogs = await client.getLogs({
    address: contractAddress,
    event: SHARD_MINTED_EVENT,
    fromBlock: 0n,
    toBlock: 'latest',
  })

  if (shardLogs.length > 0) {
    const events = parseEventLogs({ abi: GEM_SHARDS_ABI, logs: shardLogs, eventName: 'ShardMinted' })
    return [...new Set(events.map((event) => Number(event.args.tokenId)))].sort((a, b) => a - b)
  }

  const transferLogs = await client.getLogs({
    address: contractAddress,
    event: TRANSFER_EVENT,
    args: { from: ZERO_ADDRESS },
    fromBlock: 0n,
    toBlock: 'latest',
  })

  const events = parseEventLogs({ abi: GEM_SHARDS_ABI, logs: transferLogs, eventName: 'Transfer' })
  return [...new Set(events.map((event) => Number(event.args.tokenId)))].sort((a, b) => a - b)
}

export type Erc721MintAssignment = {
  onChainTokenId: number
  metadataIndex: number
}

/**
 * Resolve minted token IDs with metadata indices.
 * Uses one getLogs call for random-mint collections instead of one tokenURI per NFT.
 */
export async function fetchErc721MintAssignments(
  client: PublicClient,
  contractAddress: `0x${string}`,
  totalMinted: number,
  randomPublicMint: boolean,
): Promise<Erc721MintAssignment[]> {
  if (totalMinted <= 0) return []

  const sequential = Array.from({ length: totalMinted }, (_, index) => {
    const onChainTokenId = index + 1
    return { onChainTokenId, metadataIndex: onChainTokenId }
  })

  if (!randomPublicMint) return sequential

  const logs = await client.getLogs({
    address: contractAddress,
    event: PUBLIC_MINT_ASSIGNED_EVENT,
    fromBlock: 0n,
    toBlock: 'latest',
  })

  if (logs.length === 0) return sequential

  const metadataByTokenId = new Map<number, number>()
  const events = parseEventLogs({ abi: NFT_ABI, logs, eventName: 'PublicMintAssigned' })
  for (const event of events) {
    metadataByTokenId.set(Number(event.args.tokenId), Number(event.args.metadataIndex))
  }

  return sequential.map(({ onChainTokenId }) => ({
    onChainTokenId,
    metadataIndex: metadataByTokenId.get(onChainTokenId) ?? onChainTokenId,
  }))
}
