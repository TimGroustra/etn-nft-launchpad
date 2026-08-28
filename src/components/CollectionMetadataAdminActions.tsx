import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useChainWriteContract } from '@/hooks/useChainWriteContract'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { OperationLockOverlay } from '@/components/OperationLockOverlay'
import { useAdmin } from '@/hooks/useAdmin'
import { useNetwork } from '@/context/NetworkContext'
import { prepareCollectionMetadata, syncPublishedCollection } from '@/lib/publish-collection'
import type { Collection } from '@/types/database'

type CollectionMetadataAdminActionsProps = {
  collection: Collection
  disabled?: boolean
  onComplete?: () => void
}

export function CollectionMetadataAdminActions({
  collection,
  disabled = false,
  onComplete,
}: CollectionMetadataAdminActionsProps) {
  const { address } = useAccount()
  const { isAdmin } = useAdmin()
  const { chain } = useNetwork()
  const { writeContractAsync } = useChainWriteContract()
  const [lock, setLock] = useState<{ active: boolean; step: string; progress: number | null }>({
    active: false,
    step: '',
    progress: null,
  })

  if (!isAdmin) return null

  const editUrl = collection.contract_address
    ? `/collection/${collection.contract_address}/edit`
    : `/draft/${collection.id}/edit`
  const isPublished = Boolean(collection.contract_address)
  const busy = lock.active || disabled

  const handleSave = async () => {
    if (!address) {
      toast.error('Connect your wallet first.')
      return
    }

    setLock({ active: true, step: 'Preparing metadata files…', progress: 0 })
    try {
      await prepareCollectionMetadata(
        address,
        collection.id,
        collection.max_supply,
        (completed, total) => {
          setLock({
            active: true,
            step: `Uploading metadata ${completed} of ${total}…`,
            progress: total > 0 ? Math.round((completed / total) * 100) : null,
          })
        },
      )
      toast.success(
        isPublished
          ? 'Metadata files saved. Click Sync to push updates on-chain.'
          : 'Metadata files saved. Publish when ready.',
      )
      onComplete?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setLock({ active: false, step: '', progress: null })
    }
  }

  const handleSync = async () => {
    if (!address) {
      toast.error('Connect your wallet first.')
      return
    }
    if (!isPublished) {
      toast.error('Publish the collection before syncing on-chain.')
      return
    }

    setLock({ active: true, step: 'Preparing metadata files…', progress: 10 })
    try {
      await prepareCollectionMetadata(
        address,
        collection.id,
        collection.max_supply,
        (completed, total) => {
          setLock({
            active: true,
            step: `Uploading metadata ${completed} of ${total}…`,
            progress: total > 0 ? 10 + Math.round((completed / total) * 40) : 25,
          })
        },
        collection.contract_address
          ? {
              applyOnChainForMinted: {
                writeContractAsync,
                contractAddress: collection.contract_address as `0x${string}`,
                chainId: chain.id,
                mintMode: collection.mint_mode,
                collection,
              },
            }
          : undefined,
      )
      setLock({ active: true, step: 'Syncing on-chain — approve in your wallet…', progress: 60 })
      await syncPublishedCollection(address, collection, writeContractAsync, chain.id)
      toast.success('Collection synced on-chain')
      onComplete?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setLock({ active: false, step: '', progress: null })
    }
  }

  return (
    <>
      <OperationLockOverlay
        open={lock.active}
        title={isPublished ? 'Syncing collection' : 'Saving metadata'}
        description="Uploading token metadata files. Published collections also require wallet approval for on-chain updates."
        currentStep={lock.step}
        progress={lock.progress}
      />
      <Button variant="outline" asChild disabled={busy}>
        <Link to={editUrl} tabIndex={busy ? -1 : undefined} aria-disabled={busy}>
          Admin edit
        </Link>
      </Button>
      <Button variant="outline" onClick={() => void handleSave()} disabled={busy}>
        {lock.active && !isPublished ? 'Saving…' : 'Save'}
      </Button>
      <Button variant="outline" onClick={() => void handleSync()} disabled={busy || !isPublished}>
        {lock.active && isPublished ? 'Syncing…' : 'Sync'}
      </Button>
    </>
  )
}
