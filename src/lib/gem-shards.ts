import { formatEther, parseEther } from 'viem'
import type { NetworkKey } from '@/lib/blockchain'

export const GEM_SHARDS_PAID_MINT_PRICE = parseEther('10000')
export const GEM_SHARDS_DUAL_HOLDER_DISCOUNT_BPS = 5000n
export const ELECTROGEM_FREE_MINT_SUPPLY = 49

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
