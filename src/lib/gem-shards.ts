import { formatEther, parseEther, parseEventLogs, type TransactionReceipt } from 'viem'
import type { NetworkKey } from '@/lib/blockchain'
import { getMetadataPublicOrigin } from '@/lib/metadata-public-urls'
import gemShardsCardImage from '@/assets/gem-shards-card.jpg'

export const GEM_SHARDS_PAID_MINT_PRICE = parseEther('10000')
export const GEM_SHARDS_DUAL_HOLDER_DISCOUNT_BPS = 5000n
export const ELECTROGEM_FREE_MINT_SUPPLY = 49
export const GEM_SHARDS_CARD_IMAGE = gemShardsCardImage
export const GEM_SHARDS_MINT_CARD_DESCRIPTION =
  'Collect radiant shards of crystallized energy. Holders earn a share of launchpad fees — each mint reveals a random shard from the 495-piece collection.'

export const GEM_SHARDS_ABI = [
  {
    inputs: [{ name: 'electroGemTokenId', type: 'uint256' }],
    name: 'mintFree',
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'mintPaid',
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'enabled', type: 'bool' }],
    name: 'setMintingEnabled',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'mintingEnabled',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalMinted',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'remainingSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'payer', type: 'address' }],
    name: 'requiredPaidMintPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'publicSaleOpensAt',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'ownsElectroGem',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'isDualHolder',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'electroGemFreeMintClaimed',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'to', type: 'address' }],
    name: 'ownerMint',
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'freeMint', type: 'bool' },
    ],
    name: 'ShardMinted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
    ],
    name: 'Transfer',
    type: 'event',
  },
] as const

export const PUBLISH_FEE_DISTRIBUTOR_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'pendingReward',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenIds', type: 'uint256[]' }],
    name: 'claimBatch',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

export function getGemShardsAddress(network: NetworkKey): `0x${string}` {
  if (network === 'testnet') {
    return (import.meta.env.VITE_GEM_SHARDS_ADDRESS_TESTNET ?? ZERO_ADDRESS) as `0x${string}`
  }
  return (
    import.meta.env.VITE_GEM_SHARDS_ADDRESS_MAINNET
    ?? import.meta.env.VITE_GEM_SHARDS_ADDRESS
    ?? ZERO_ADDRESS
  ) as `0x${string}`
}

export function getPublishFeeDistributorAddress(network: NetworkKey): `0x${string}` {
  if (network === 'testnet') {
    return (import.meta.env.VITE_PUBLISH_FEE_DISTRIBUTOR_ADDRESS_TESTNET ?? ZERO_ADDRESS) as `0x${string}`
  }
  return (
    import.meta.env.VITE_PUBLISH_FEE_DISTRIBUTOR_ADDRESS_MAINNET
    ?? import.meta.env.VITE_PUBLISH_FEE_DISTRIBUTOR_ADDRESS
    ?? ZERO_ADDRESS
  ) as `0x${string}`
}

export function resolveGemShardsAddress(
  network: NetworkKey,
  config?: {
    gem_shards_mainnet?: string
    gem_shards_testnet?: string
  },
): `0x${string}` {
  const fromDb = network === 'testnet' ? config?.gem_shards_testnet : config?.gem_shards_mainnet
  if (fromDb && fromDb !== ZERO_ADDRESS) return fromDb as `0x${string}`
  return getGemShardsAddress(network)
}

export function resolvePublishFeeDistributorAddress(
  network: NetworkKey,
  config?: {
    publish_fee_distributor_mainnet?: string
    publish_fee_distributor_testnet?: string
  },
): `0x${string}` {
  const fromDb =
    network === 'testnet'
      ? config?.publish_fee_distributor_testnet
      : config?.publish_fee_distributor_mainnet
  if (fromDb && fromDb !== ZERO_ADDRESS) return fromDb as `0x${string}`
  return getPublishFeeDistributorAddress(network)
}

export function formatPaidMintPriceLabel(priceWei: bigint): string {
  return `${formatEther(priceWei)} ETN`
}

export function applyDualHolderMintDiscount(basePriceWei: bigint): bigint {
  return (basePriceWei * (10_000n - GEM_SHARDS_DUAL_HOLDER_DISCOUNT_BPS)) / 10_000n
}

export type GemShardsContractAddress = `0x${string}`

export function isGemShardsContract(
  contractAddress: string | null | undefined,
  networkKey: NetworkKey,
  config?: {
    gem_shards_mainnet?: string
    gem_shards_testnet?: string
  },
): boolean {
  if (!contractAddress) return false
  const gemShards = resolveGemShardsAddress(networkKey, config)
  if (gemShards === ZERO_ADDRESS) return false
  return contractAddress.toLowerCase() === gemShards.toLowerCase()
}

const ZERO_MINT_ADDRESS = '0x0000000000000000000000000000000000000000' as const

/** Resolve minted shard token IDs from a Gem Shards mint transaction. */
export function parseGemShardsMintReceipt(
  receipt: TransactionReceipt,
  contractAddress: string,
): number[] {
  const normalized = contractAddress.toLowerCase()
  const logs = receipt.logs.filter((log) => log.address.toLowerCase() === normalized)

  const shardMinted = parseEventLogs({
    abi: GEM_SHARDS_ABI,
    logs,
    eventName: 'ShardMinted',
  })
  if (shardMinted.length > 0) {
    return shardMinted.map((event) => Number(event.args.tokenId))
  }

  return parseEventLogs({
    abi: GEM_SHARDS_ABI,
    logs,
    eventName: 'Transfer',
  })
    .filter((event) => event.args.from?.toLowerCase() === ZERO_MINT_ADDRESS)
    .map((event) => Number(event.args.tokenId))
}

export function getGemShardImageFileName(tokenId: number): string {
  return `${String(tokenId).padStart(3, '0')}.png`
}

export function getGemShardPublicStorageUrl(storagePath: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  if (!supabaseUrl) {
    return `${getMetadataPublicOrigin()}/gem-shards/${storagePath}`
  }
  return `${supabaseUrl}/storage/v1/object/public/gem-shards/${storagePath}`
}

export function getGemShardImageUrl(tokenId: number): string {
  return getGemShardPublicStorageUrl(`images/${getGemShardImageFileName(tokenId)}`)
}

function getGemShardMetadataApiUrl(tokenId: number): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  if (!supabaseUrl) return ''
  return `${supabaseUrl}/functions/v1/gem-shard-metadata/${tokenId}`
}

export type GemShardDisplayInfo = {
  tokenId: number
  name: string
  imageUrl: string
}

export async function fetchGemShardDisplayInfo(tokenId: number): Promise<GemShardDisplayInfo> {
  const imageUrl = getGemShardImageUrl(tokenId)
  const apiUrl = getGemShardMetadataApiUrl(tokenId)

  if (apiUrl) {
    try {
      const response = await fetch(apiUrl)
      if (response.ok) {
        const metadata = (await response.json()) as { name?: string; image?: string }
        return {
          tokenId,
          name: metadata.name?.trim() || `Gem Shard #${tokenId}`,
          imageUrl: typeof metadata.image === 'string' && metadata.image ? metadata.image : imageUrl,
        }
      }
    } catch {
      // Fall back to static metadata below.
    }
  }

  try {
    const response = await fetch(getGemShardPublicStorageUrl(`metadata/${tokenId}.json`))
    if (response.ok) {
      const metadata = (await response.json()) as { name?: string }
      return {
        tokenId,
        name: metadata.name?.trim() || `Gem Shard #${tokenId}`,
        imageUrl,
      }
    }
  } catch {
    // Use generic fallback below.
  }

  return {
    tokenId,
    name: `Gem Shard #${tokenId}`,
    imageUrl,
  }
}

export async function fetchGemShardsMintDisplayInfo(tokenIds: number[]): Promise<GemShardDisplayInfo[]> {
  return Promise.all(tokenIds.map((tokenId) => fetchGemShardDisplayInfo(tokenId)))
}
