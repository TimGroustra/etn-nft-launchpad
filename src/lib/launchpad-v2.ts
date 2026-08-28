export type LaunchpadV2PlatformConfig = {
  launchpad_v2_preview_enabled?: string
}

export function isLaunchpadV2PreviewEnabled(
  config?: LaunchpadV2PlatformConfig | null,
): boolean {
  return config?.launchpad_v2_preview_enabled !== 'false'
}

/** ERC-721 V2, ERC-1155, and V2 factories when enabled in platform config. */
export function canUseLaunchpadV2(
  _walletAddress?: string | null,
  config?: LaunchpadV2PlatformConfig | null,
): boolean {
  return isLaunchpadV2PreviewEnabled(config)
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
