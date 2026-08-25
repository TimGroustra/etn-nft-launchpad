import { useAccount } from 'wagmi'
import { usePlatformConfig } from '@/hooks/usePlatformConfig'
import { canUseLaunchpadV2 } from '@/lib/launchpad-v2'

export function useLaunchpadV2() {
  const { address } = useAccount()
  const { data: platformConfig } = usePlatformConfig()
  const enabled = canUseLaunchpadV2(address, platformConfig)

  return {
    canUseLaunchpadV2: enabled,
    platformConfig,
  }
}
