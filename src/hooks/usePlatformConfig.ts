import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getFactoryAddress as getEnvFactoryAddress, type NetworkKey } from '@/lib/blockchain'

interface PlatformConfig {
  factory_address_mainnet?: string
  factory_address_testnet?: string
}

async function fetchPlatformConfig(): Promise<PlatformConfig> {
  const { data, error } = await supabase.from('platform_config').select('key, value')
  if (error) throw error

  const config: PlatformConfig = {}
  for (const row of (data ?? []) as Array<{ key: string; value: string }>) {
    if (row.key === 'factory_address_mainnet') config.factory_address_mainnet = row.value
    if (row.key === 'factory_address_testnet') config.factory_address_testnet = row.value
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
