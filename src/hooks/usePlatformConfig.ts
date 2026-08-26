import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getFactoryAddress as getEnvFactoryAddress, getFactoryV2Address, type NetworkKey } from '@/lib/blockchain'
import type { TokenStandard } from '@/lib/collection-contract'

interface PlatformConfig {
  factory_address_mainnet?: string
  factory_address_testnet?: string
  factory_address_v2_erc721_mainnet?: string
  factory_address_v2_erc721_testnet?: string
  factory_address_v2_erc1155_mainnet?: string
  factory_address_v2_erc1155_testnet?: string
  launchpad_minter_mainnet?: string
  launchpad_minter_testnet?: string
  launchpad_v2_preview_enabled?: string
}

async function fetchPlatformConfig(): Promise<PlatformConfig> {
  const { data, error } = await supabase.from('platform_config').select('key, value')
  if (error) throw error

  const config: PlatformConfig = {}
  for (const row of (data ?? []) as Array<{ key: string; value: string }>) {
    if (row.key === 'factory_address_mainnet') config.factory_address_mainnet = row.value
    if (row.key === 'factory_address_testnet') config.factory_address_testnet = row.value
    if (row.key === 'factory_address_v2_erc721_mainnet') config.factory_address_v2_erc721_mainnet = row.value
    if (row.key === 'factory_address_v2_erc721_testnet') config.factory_address_v2_erc721_testnet = row.value
    if (row.key === 'factory_address_v2_erc1155_mainnet') config.factory_address_v2_erc1155_mainnet = row.value
    if (row.key === 'factory_address_v2_erc1155_testnet') config.factory_address_v2_erc1155_testnet = row.value
    if (row.key === 'factory_address_v2_mainnet') {
      config.factory_address_v2_erc721_mainnet = row.value
    }
    if (row.key === 'factory_address_v2_testnet') {
      config.factory_address_v2_erc721_testnet = row.value
    }
    if (row.key === 'launchpad_v2_preview_enabled') config.launchpad_v2_preview_enabled = row.value
    if (row.key === 'launchpad_minter_mainnet') config.launchpad_minter_mainnet = row.value
    if (row.key === 'launchpad_minter_testnet') config.launchpad_minter_testnet = row.value
  }
  return config
}

export function usePlatformConfig() {
  return useQuery({
    queryKey: ['platform-config'],
    queryFn: fetchPlatformConfig,
    staleTime: 60_000,
  })
}

export function resolveFactoryAddress(network: NetworkKey, config?: PlatformConfig): `0x${string}` {
  const fromDb =
    network === 'testnet' ? config?.factory_address_testnet : config?.factory_address_mainnet

  if (fromDb && fromDb !== '0x0000000000000000000000000000000000000000') {
    return fromDb as `0x${string}`
  }

  return getEnvFactoryAddress(network)
}

export function resolveFactoryV2Address(
  network: NetworkKey,
  config: PlatformConfig | undefined,
  tokenStandard: TokenStandard,
): `0x${string}` {
  const is1155 = tokenStandard === 'erc1155'
  const fromDb = is1155
    ? network === 'testnet'
      ? config?.factory_address_v2_erc1155_testnet
      : config?.factory_address_v2_erc1155_mainnet
    : network === 'testnet'
      ? config?.factory_address_v2_erc721_testnet
      : config?.factory_address_v2_erc721_mainnet

  if (fromDb && fromDb !== '0x0000000000000000000000000000000000000000') {
    return fromDb as `0x${string}`
  }

  return getFactoryV2Address(network, tokenStandard)
}
