import { useQuery } from '@tanstack/react-query'
import { useAccount, usePublicClient } from 'wagmi'
import { useCreatorAccess } from '@/hooks/useCreatorAccess'
import { resolveRequiredPublishFeeWei } from '@/lib/publish-fee-resolution'

export function useResolvedPublishFeeWei(
  factoryAddress: `0x${string}` | undefined,
  chainId: number,
  maxSupply: number,
  fallbackPerTenWei: bigint,
) {
  const { address } = useAccount()
  const { holdings } = useCreatorAccess()
  const publicClient = usePublicClient({ chainId })

  return useQuery({
    queryKey: ['resolvedPublishFee', factoryAddress, address, chainId, maxSupply, fallbackPerTenWei.toString()],
    queryFn: () =>
      resolveRequiredPublishFeeWei(
        publicClient!,
        factoryAddress!,
        address!,
        maxSupply,
        fallbackPerTenWei,
        holdings,
      ),
    enabled: Boolean(publicClient && factoryAddress && address && maxSupply > 0),
    staleTime: 30_000,
  })
}
