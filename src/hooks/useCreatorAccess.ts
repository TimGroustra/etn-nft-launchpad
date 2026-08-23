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

/** NFT holdings for publish-fee discounts and creator-access gating. */
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
    resolvePublishFeeWei: (publishFeePerTenWei: bigint, maxSupply: number) =>
      resolvePublishFeeWei(publishFeePerTenWei, maxSupply, holdings),
  }
}

/** Read on-chain required publish fee for a collection max supply. */
export function useRequiredPublishFee(
  factoryAddress?: `0x${string}`,
  chainId?: number,
  maxSupply?: number,
) {
  const { address } = useAccount()

  return useReadContract({
    address: factoryAddress,
    abi: [
      {
        inputs: [
          { name: 'payer', type: 'address' },
          { name: 'maxSupply', type: 'uint256' },
        ],
        name: 'requiredPublishFee',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
    ] as const,
    functionName: 'requiredPublishFee',
    args: address && maxSupply != null && maxSupply > 0 ? [address, BigInt(maxSupply)] : undefined,
    chainId,
    query: {
      enabled: Boolean(factoryAddress && address && chainId && maxSupply != null && maxSupply > 0),
    },
  })
}
