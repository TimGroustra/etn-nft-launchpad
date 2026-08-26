import type { NetworkKey } from '@/lib/blockchain'
import { computeRequiredMintPaymentWei } from '@/lib/platform-fees'
import type { Collection } from '@/types/database'

export type LaunchpadMinterConfig = {
  launchpad_minter_mainnet?: string
  launchpad_minter_testnet?: string
}

const ZERO = '0x0000000000000000000000000000000000000000'

export function resolveLaunchpadMinterAddress(
  network: NetworkKey,
  config?: LaunchpadMinterConfig,
): `0x${string}` | null {
  const fromEnv =
    network === 'testnet'
      ? import.meta.env.VITE_LAUNCHPAD_MINTER_TESTNET
      : import.meta.env.VITE_LAUNCHPAD_MINTER_MAINNET
  const fromDb =
    network === 'testnet' ? config?.launchpad_minter_testnet : config?.launchpad_minter_mainnet
  const candidate = (fromDb || fromEnv || '').trim()
  if (!candidate || candidate.toLowerCase() === ZERO) return null
  return candidate as `0x${string}`
}

/** V2 collections use mint-price-only contracts; platform fee is collected by LaunchpadMinter. */
export function usesLaunchpadMinterRoute(collection: Collection): boolean {
  return (collection.contract_version ?? 1) >= 2
}

export function shouldUseLaunchpadMinter(
  collection: Collection,
  network: NetworkKey,
  config?: LaunchpadMinterConfig,
): boolean {
  return usesLaunchpadMinterRoute(collection) && Boolean(resolveLaunchpadMinterAddress(network, config))
}

export function collectionHasLegacyOnChainMintFee(
  platformMintFeeBps: bigint | undefined,
  readFailed: boolean,
  collection: Collection,
): boolean {
  if (usesLaunchpadMinterRoute(collection)) return false
  return !readFailed && (platformMintFeeBps ?? 0n) > 0n
}

export function resolveLaunchpadMintPaymentWei({
  baseMintWei,
  platformFeeExempt,
  usesLaunchpadMinter,
  legacyOnChainMintFee,
  requiredMintPaymentWei,
}: {
  baseMintWei: bigint
  platformFeeExempt: boolean
  usesLaunchpadMinter: boolean
  legacyOnChainMintFee: boolean
  requiredMintPaymentWei?: bigint
}): { totalMintWei: bigint; platformMintFeeWei: bigint } {
  if (usesLaunchpadMinter) {
    const totalMintWei = computeRequiredMintPaymentWei(baseMintWei, platformFeeExempt)
    const platformMintFeeWei = totalMintWei > baseMintWei ? totalMintWei - baseMintWei : 0n
    return { totalMintWei, platformMintFeeWei }
  }

  if (!legacyOnChainMintFee || baseMintWei <= 0n) {
    return { totalMintWei: baseMintWei, platformMintFeeWei: 0n }
  }

  const totalMintWei =
    requiredMintPaymentWei ?? computeRequiredMintPaymentWei(baseMintWei, platformFeeExempt)
  const platformMintFeeWei = totalMintWei > baseMintWei ? totalMintWei - baseMintWei : 0n
  return { totalMintWei, platformMintFeeWei }
}
