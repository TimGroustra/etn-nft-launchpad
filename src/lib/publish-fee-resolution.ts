import type { PublicClient } from 'viem'
import {
  applyPublishFeeDiscount,
  getPublishFeeDiscountBps,
  type CreatorNftHoldings,
} from '@/lib/creator-access'
import { computeTieredPublishFeeWei } from '@/lib/platform-fees'

export const LEGACY_REQUIRED_PUBLISH_FEE_ABI = [
  {
    inputs: [{ name: 'payer', type: 'address' }],
    name: 'requiredPublishFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const TIERED_REQUIRED_PUBLISH_FEE_ABI = [
  {
    inputs: [
      { name: 'payer', type: 'address' },
      { name: 'maxSupply', type: 'uint256' },
    ],
    name: 'requiredPublishFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const PUBLISH_FEE_PER_TEN_ABI = [
  {
    inputs: [],
    name: 'publishFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export async function resolveRequiredPublishFeeWei(
  client: PublicClient,
  factoryAddress: `0x${string}`,
  payer: `0x${string}`,
  maxSupply: number,
  fallbackPerTenWei: bigint,
  holdings?: CreatorNftHoldings,
): Promise<bigint> {
  if (maxSupply > 0) {
    try {
      return await client.readContract({
        address: factoryAddress,
        abi: TIERED_REQUIRED_PUBLISH_FEE_ABI,
        functionName: 'requiredPublishFee',
        args: [payer, BigInt(maxSupply)],
      })
    } catch {
      // New tiered factory not available — try legacy flat fee with on-chain dual-holder discount.
    }
  }

  try {
    return await client.readContract({
      address: factoryAddress,
      abi: LEGACY_REQUIRED_PUBLISH_FEE_ABI,
      functionName: 'requiredPublishFee',
      args: [payer],
    })
  } catch {
    // Fall through to local tiered estimate.
  }

  let perTenWei = fallbackPerTenWei
  try {
    perTenWei = await client.readContract({
      address: factoryAddress,
      abi: PUBLISH_FEE_PER_TEN_ABI,
      functionName: 'publishFee',
    })
  } catch {
    // Use env/default fallback.
  }

  const tierFeeWei = computeTieredPublishFeeWei(maxSupply, perTenWei)
  if (!holdings) return tierFeeWei

  return applyPublishFeeDiscount(tierFeeWei, getPublishFeeDiscountBps(holdings))
}
