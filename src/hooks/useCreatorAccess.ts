import { useMemo } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import {
  CLUB_WATCH_NFT_ADDRESS,
  CREATOR_ACCESS_CHAIN_ID,
  ELECTROGEMS_NFT_ADDRESS,
  ERC721_BALANCE_ABI,
  getPublishFeeDiscountBps,
  hasCreatorNftAccess,
  holdingsFromBalances,
  resolvePublishFeeWei,
} from '@/lib/creator-access'

/** NFT holdings for publish-fee discounts and creator-access messaging. Create routes remain admin-only. */
export function useCreatorAccess() {
  const { address, isConnected } = useAccount()

  const { data: balances, isLoading: balancesLoading } = useReadContracts({
    contracts: [
      {
        address: ELECTROGEMS_NFT_ADDRESS,
        abi: ERC721_BALANCE_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        chainId: CREATOR_ACCESS_CHAIN_ID,
      },
      {
        address: CLUB_WATCH_NFT_ADDRESS,
        abi: ERC721_BALANCE_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        chainId: CREATOR_ACCESS_CHAIN_ID,
      },
    ],
    query: {
      enabled: Boolean(address),
      staleTime: 60_000,
    },
  })

  const holdings = useMemo(
    () =>
      holdingsFromBalances(
        balances?.[0]?.status === 'success' ? balances[0].result : undefined,
        balances?.[1]?.status === 'success' ? balances[1].result : undefined,
      ),
    [balances],
  )

  const publishFeeDiscountBps = getPublishFeeDiscountBps(holdings)
  const hasDualHolderDiscount = publishFeeDiscountBps > 0n
  const hasCreatorAccess = hasCreatorNftAccess(holdings)

  return {
    address,
    isConnected,
    holdings,
    hasCreatorAccess,
    publishFeeDiscountBps,
    hasDualHolderDiscount,
    holdingsLoading: Boolean(address) && balancesLoading,
    resolvePublishFeeWei: (baseFeeWei: bigint) => resolvePublishFeeWei(baseFeeWei, holdings),
  }
}

/** Read on-chain required publish fee when the factory supports dual-holder discounts. */
export function useRequiredPublishFee(factoryAddress?: `0x${string}`, chainId?: number) {
  const { address } = useAccount()

  return useReadContract({
    address: factoryAddress,
    abi: [
      {
        inputs: [{ name: 'payer', type: 'address' }],
        name: 'requiredPublishFee',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
    ] as const,
    functionName: 'requiredPublishFee',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: Boolean(factoryAddress && address && chainId),
    },
  })
}
