import { formatEther } from 'viem'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { useResolvedPublishFeeWei } from '@/hooks/useResolvedPublishFeeWei'
import { useCreatorAccess } from '@/hooks/useCreatorAccess'
import { resolvePublishFeeWei } from '@/lib/creator-access'
import { isTreasuryWallet } from '@/lib/blockchain'
import type { Collection } from '@/types/database'

type DraftPublishButtonProps = {
  collection: Collection
  factoryAddress: `0x${string}`
  chainId: number
  fallbackPerTenWei: bigint
  publishFeeReady: boolean
  isPublishing: boolean
  publishingId: string | null
  confirming: boolean
  onPublish: (collection: Collection) => void
}

export function DraftPublishButton({
  collection,
  factoryAddress,
  chainId,
  fallbackPerTenWei,
  publishFeeReady,
  isPublishing,
  publishingId,
  confirming,
  onPublish,
}: DraftPublishButtonProps) {
  const { address } = useAccount()
  const { holdings } = useCreatorAccess()
  const { data: resolvedFeeWei, isLoading: feeLoading } = useResolvedPublishFeeWei(
    factoryAddress,
    chainId,
    collection.max_supply,
    fallbackPerTenWei,
  )
  const localEstimate = resolvePublishFeeWei(fallbackPerTenWei, collection.max_supply, holdings)
  const feeWei = resolvedFeeWei ?? localEstimate.feeWei
  const feeLabel = formatEther(feeWei)
  const tierFeeLabel = formatEther(localEstimate.tierFeeWei)
  const showPublishDiscount =
    localEstimate.discountBps > 0n && feeWei < localEstimate.tierFeeWei
  const isTreasury = isTreasuryWallet(address)

  const disabled =
    isPublishing ||
    publishingId === collection.id ||
    confirming ||
    !publishFeeReady ||
    feeLoading

  let label = 'Publish'
  if (publishingId === collection.id) {
    label = 'Publishing...'
  } else if (!publishFeeReady || feeLoading) {
    label = 'Loading fee…'
  } else if (collection.contract_address) {
    label = 'Complete publish'
  } else if (isTreasury && feeWei > 0n) {
    label = `Publish (${feeLabel} ETN, $0 net)`
  } else if (showPublishDiscount) {
    label = `Publish (${feeLabel} ETN, 50% off ${tierFeeLabel})`
  } else {
    label = `Publish (${feeLabel} ETN)`
  }

  return (
    <Button onClick={() => onPublish(collection)} disabled={disabled}>
      {label}
    </Button>
  )
}
