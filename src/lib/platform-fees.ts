/** Launchpad platform mint fee for wallets without ElectroGem or Club Watch. */
export const PLATFORM_MINT_FEE_BPS = 300n

/** Max supply is billed in blocks of this many NFTs. */
export const PUBLISH_FEE_SUPPLY_UNIT = 10

export function computePlatformMintFeeWei(baseWei: bigint, exempt: boolean): bigint {
  if (exempt || baseWei <= 0n) return 0n
  return (baseWei * PLATFORM_MINT_FEE_BPS) / 10_000n
}

export function computeRequiredMintPaymentWei(baseWei: bigint, exempt: boolean): bigint {
  return baseWei + computePlatformMintFeeWei(baseWei, exempt)
}

/** 1000 ETN per 10 max-supply units (ceil). publishFeePerTenWei is the factory publishFee value. */
export function computeTieredPublishFeeWei(maxSupply: number, publishFeePerTenWei: bigint): bigint {
  if (maxSupply <= 0 || publishFeePerTenWei <= 0n) return 0n
  const tiers = BigInt(Math.ceil(maxSupply / PUBLISH_FEE_SUPPLY_UNIT))
  return tiers * publishFeePerTenWei
}

export function formatPlatformMintFeePercent(): string {
  return `${Number(PLATFORM_MINT_FEE_BPS) / 100}%`
}

export function supportsPlatformMintFee(platformMintFeeBps: bigint | undefined, readFailed: boolean): boolean {
  return !readFailed && (platformMintFeeBps ?? 0n) > 0n
}

export function resolveMintPaymentWei({
  baseMintWei,
  platformFeeExempt,
  supportsPlatformMintFee,
  requiredMintPaymentWei,
}: {
  baseMintWei: bigint
  platformFeeExempt: boolean
  supportsPlatformMintFee: boolean
  requiredMintPaymentWei?: bigint
}): { totalMintWei: bigint; platformMintFeeWei: bigint } {
  if (!supportsPlatformMintFee || baseMintWei <= 0n) {
    return { totalMintWei: baseMintWei, platformMintFeeWei: 0n }
  }

  const totalMintWei =
    requiredMintPaymentWei ?? computeRequiredMintPaymentWei(baseMintWei, platformFeeExempt)
  const platformMintFeeWei = totalMintWei > baseMintWei ? totalMintWei - baseMintWei : 0n
  return { totalMintWei, platformMintFeeWei }
}
