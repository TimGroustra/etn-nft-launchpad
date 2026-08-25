import { isAdminWallet } from '@/lib/admin'

export type LaunchpadV2PlatformConfig = {
  launchpad_v2_preview_enabled?: string
}

export function isLaunchpadV2PreviewEnabled(
  config?: LaunchpadV2PlatformConfig | null,
): boolean {
  return config?.launchpad_v2_preview_enabled !== 'false'
}

/** Admins only: ERC-721 V2, ERC-1155, full ERC-4906, and V2 factories. */
export function canUseLaunchpadV2(
  walletAddress?: string | null,
  config?: LaunchpadV2PlatformConfig | null,
): boolean {
  return isAdminWallet(walletAddress) && isLaunchpadV2PreviewEnabled(config)
}

export function resolveContractVersionForCreate(
  walletAddress: string | undefined,
  config: LaunchpadV2PlatformConfig | null | undefined,
  requestedVersion?: number,
): 1 | 2 {
  if (!canUseLaunchpadV2(walletAddress, config)) return 1
  return requestedVersion === 1 ? 1 : 2
}

export function resolveTokenStandardForCreate(
  walletAddress: string | undefined,
  config: LaunchpadV2PlatformConfig | null | undefined,
  requested?: 'erc721' | 'erc1155',
): 'erc721' | 'erc1155' {
  if (!canUseLaunchpadV2(walletAddress, config)) return 'erc721'
  return requested === 'erc1155' ? 'erc1155' : 'erc721'
}
