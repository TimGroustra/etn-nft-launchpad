const ELECTROGEMS_NFT_ADDRESS = (
  Deno.env.get('ELECTROGEMS_NFT_ADDRESS') ?? '0xcff0d88Ed5311bAB09178b6ec19A464100880984'
).toLowerCase()

const CLUB_WATCH_NFT_ADDRESS = (
  Deno.env.get('CLUB_WATCH_NFT_ADDRESS') ?? '0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1'
).toLowerCase()

const DUAL_HOLDER_DISCOUNT_BPS = 5000n
const PUBLISH_FEE_SUPPLY_UNIT = 10

function computeTieredPublishFeeWei(maxSupply: number, publishFeePerTenWei: bigint): bigint {
  if (maxSupply <= 0 || publishFeePerTenWei <= 0n) return 0n
  const tiers = BigInt(Math.ceil(maxSupply / PUBLISH_FEE_SUPPLY_UNIT))
  return tiers * publishFeePerTenWei
}

const FACTORY_REQUIRED_FEE_ABI = [
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

const ERC721_BALANCE_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

type PublicClient = ReturnType<
  typeof import('https://esm.sh/viem@2.21.0').createPublicClient
>

export async function readNftHoldings(
  client: PublicClient,
  wallet: `0x${string}`,
): Promise<{ ownsElectroGem: boolean; ownsClubWatch: boolean }> {
  const [electroGemBalance, clubWatchBalance] = await Promise.all([
    client
      .readContract({
        address: ELECTROGEMS_NFT_ADDRESS as `0x${string}`,
        abi: ERC721_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [wallet],
      })
      .catch(() => 0n),
    client
      .readContract({
        address: CLUB_WATCH_NFT_ADDRESS as `0x${string}`,
        abi: ERC721_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [wallet],
      })
      .catch(() => 0n),
  ])

  return {
    ownsElectroGem: electroGemBalance > 0n,
    ownsClubWatch: clubWatchBalance > 0n,
  }
}

export function applyPublishFeeDiscount(baseFeeWei: bigint, discountBps: bigint): bigint {
  if (discountBps <= 0n) return baseFeeWei
  if (discountBps >= 10_000n) return 0n
  return (baseFeeWei * (10_000n - discountBps)) / 10_000n
}

export function resolvePublishFeeDiscountBps(holdings: {
  ownsElectroGem: boolean
  ownsClubWatch: boolean
}): bigint {
  if (holdings.ownsElectroGem && holdings.ownsClubWatch) return DUAL_HOLDER_DISCOUNT_BPS
  return 0n
}

export async function resolveRequiredPublishFeeWei(
  client: PublicClient,
  factoryAddress: string | null,
  wallet: `0x${string}`,
  publishFeePerTenWei: bigint,
  maxSupply: number,
): Promise<bigint> {
  if (factoryAddress && maxSupply > 0) {
    try {
      const required = await client.readContract({
        address: factoryAddress as `0x${string}`,
        abi: FACTORY_REQUIRED_FEE_ABI,
        functionName: 'requiredPublishFee',
        args: [wallet, BigInt(maxSupply)],
      })
      return BigInt(required)
    } catch {
      // Fall through to local tiered estimate.
    }
  }

  const tierFeeWei = computeTieredPublishFeeWei(maxSupply, publishFeePerTenWei)
  const holdings = await readNftHoldings(client, wallet)
  const discountBps = resolvePublishFeeDiscountBps(holdings)
  return applyPublishFeeDiscount(tierFeeWei, discountBps)
}
