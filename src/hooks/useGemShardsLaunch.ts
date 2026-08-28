import { useMemo } from 'react'
import { usePlatformConfig } from '@/hooks/usePlatformConfig'
import { getChainKey } from '@/lib/blockchain'
import { useNetwork } from '@/context/NetworkContext'
import { resolveGemShardsAddress } from '@/lib/gem-shards'

export type GemShardsLaunchStatus = 'unconfigured' | 'draft' | 'published'

export function useGemShardsLaunch() {
  const { chain } = useNetwork()
  const networkKey = getChainKey(chain.id)
  const { data: platformConfig, isLoading } = usePlatformConfig()

  const gemShardsAddress = resolveGemShardsAddress(networkKey, {
    gem_shards_mainnet: platformConfig?.gem_shards_mainnet,
    gem_shards_testnet: platformConfig?.gem_shards_testnet,
  })

  const statusValue =
    networkKey === 'testnet'
      ? platformConfig?.gem_shards_status_testnet
      : platformConfig?.gem_shards_status_mainnet

  const launchStatus = useMemo((): GemShardsLaunchStatus => {
    if (gemShardsAddress === '0x0000000000000000000000000000000000000000') {
      return 'unconfigured'
    }
    return statusValue === 'published' ? 'published' : 'draft'
  }, [gemShardsAddress, statusValue])

  return {
    gemShardsAddress,
    launchStatus,
    isPublished: launchStatus === 'published',
    isDraft: launchStatus === 'draft',
    isConfigured: launchStatus !== 'unconfigured',
    loading: isLoading,
    networkKey,
  }
}
