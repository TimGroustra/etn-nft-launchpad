import { getAddress } from 'viem'
import { electroneum } from '@/lib/blockchain'

function resolveCreatorNftAddress(value: string | undefined, fallback: `0x${string}`): `0x${string}` {
  return getAddress((value ?? fallback) as `0x${string}`)
}

/** ElectroGems (ElectroGem) ERC-721 on Electroneum mainnet. */
export const ELECTROGEMS_NFT_ADDRESS = resolveCreatorNftAddress(
  import.meta.env.VITE_ELECTROGEMS_NFT_ADDRESS,
  '0xcff0d88Ed5311bAB09178b6ec19A464100880984',
)

/** Club Watch ERC-721 on Electroneum mainnet. */
export const CLUB_WATCH_NFT_ADDRESS = resolveCreatorNftAddress(
  import.meta.env.VITE_CLUB_WATCH_NFT_ADDRESS,
  '0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1',
)

export const CREATOR_ACCESS_CHAIN_ID = electroneum.id

/** 50% off publish fee when the wallet holds at least one NFT from each collection. */
export const DUAL_HOLDER_DISCOUNT_BPS = 5000n

export const ERC721_BALANCE_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const CREATOR_ACCESS_COLLECTIONS = [
  {
    key: 'electrogem',
    label: 'ElectroGem',
    address: ELECTROGEMS_NFT_ADDRESS,
    marketUrl: `https://app.electroswap.io/nfts/collection/${ELECTROGEMS_NFT_ADDRESS}`,
  },
  {
    key: 'clubWatch',
    label: 'Club Watch',
    address: CLUB_WATCH_NFT_ADDRESS,
    marketUrl: `https://app.electroswap.io/nfts/collection/${CLUB_WATCH_NFT_ADDRESS}`,
  },
] as const

export type CreatorNftHoldings = {
  ownsElectroGem: boolean
  ownsClubWatch: boolean
}

export function holdingsFromBalances(
  electroGemBalance: bigint | undefined,
  clubWatchBalance: bigint | undefined,
): CreatorNftHoldings {
  return {
    ownsElectroGem: (electroGemBalance ?? 0n) > 0n,
    ownsClubWatch: (clubWatchBalance ?? 0n) > 0n,
  }
}

export function hasCreatorNftAccess(holdings: CreatorNftHoldings): boolean {
  return holdings.ownsElectroGem || holdings.ownsClubWatch
}

/** Whether the wallet qualifies as a creator (NFT gate). Create routes remain admin-only for now. */
export function canAccessCreatorTools(isAdmin: boolean, holdings: CreatorNftHoldings): boolean {
  return isAdmin || hasCreatorNftAccess(holdings)
}

export function getPublishFeeDiscountBps(holdings: CreatorNftHoldings): bigint {
  if (holdings.ownsElectroGem && holdings.ownsClubWatch) return DUAL_HOLDER_DISCOUNT_BPS
  return 0n
}

export function applyPublishFeeDiscount(baseFeeWei: bigint, discountBps: bigint): bigint {
  if (discountBps <= 0n) return baseFeeWei
  if (discountBps >= 10_000n) return 0n
  return (baseFeeWei * (10_000n - discountBps)) / 10_000n
}

export function resolvePublishFeeWei(baseFeeWei: bigint, holdings: CreatorNftHoldings): {
  feeWei: bigint
  discountBps: bigint
} {
  const discountBps = getPublishFeeDiscountBps(holdings)
  return {
    feeWei: applyPublishFeeDiscount(baseFeeWei, discountBps),
    discountBps,
  }
}
