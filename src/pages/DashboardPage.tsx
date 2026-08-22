import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { createPublicClient, http, type TransactionReceipt } from 'viem'
import { toast } from 'sonner'
import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useCollections, useArchivedCollections } from '@/hooks/useCollections'
import { WalletAuthButton, useWalletAuth } from '@/hooks/useWalletAuth'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { CollectionOwnerPanel } from '@/components/CollectionOwnerPanel'
import { useNetwork } from '@/context/NetworkContext'
import { formatEther } from 'viem'
import { FACTORY_ABI, getChainId, getPublishFeeWei, resolveDeployedCollectionAddress } from '@/lib/blockchain'
import { usePlatformConfig, resolveFactoryAddress } from '@/hooks/usePlatformConfig'
import { firstIssueMessage, validateCollectionForPublish } from '@/lib/create-collection-validation'
import { updateCollection, verifyPublishPayment, verifyCollectionContract, deleteCollection, archiveCollection, restoreCollection } from '@/lib/api'
import { configurePublicMint, prepareCollectionMetadata, syncPublishedCollection } from '@/lib/publish-collection'
import { listCollectionTokens } from '@/lib/collection-metadata'
import { cn } from '@/lib/utils'
import type { Collection } from '@/types/database'

function CollectionAccordionItem({
  collection,
  expanded,
  onToggle,
  children,
}: {
  collection: Collection
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const networkLabel =
    collection.chain_id === 5201420 ? 'Testnet' : collection.chain_id === 52014 ? 'Mainnet' : null

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-4 p-6 text-left transition-colors hover:bg-slate-900/40"
      >
        <div className="min-w-0">
          <CardTitle className="truncate">{collection.name}</CardTitle>
          <CardDescription className="mt-1">
            {collection.status} · {collection.mint_mode} · {collection.symbol}
            {networkLabel ? ` · ${networkLabel}` : ''}
          </CardDescription>
          {collection.contract_address && !expanded && (
            <p className="mt-1 text-xs text-green-400">Published on-chain</p>
          )}
        </div>
        <ChevronDown
          className={cn('mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform', expanded && 'rotate-180')}
        />
      </button>
      {expanded && <div className="space-y-4 border-t border-slate-800 px-6 pb-6 pt-4">{children}</div>}
    </Card>
  )
}

export function DashboardPage() {
  const { address, isConnected } = useAccount()
  const { isAuthenticated } = useWalletAuth()
  const { network, chain } = useNetwork()
  const chainId = getChainId(network)
  const { data: collections = [], refetch: refetchActive } = useCollections(address, chainId, 'active')
  const { data: archivedCollections = [], refetch: refetchArchived } = useArchivedCollections(address, chainId)
  const [view, setView] = useState<'active' | 'archive'>('active')
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { writeContractAsync, data: txHash } = useWriteContract()
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash })

  const { data: platformConfig } = usePlatformConfig()
  const factoryAddress = resolveFactoryAddress(network, platformConfig)
  const zeroAddress = '0x0000000000000000000000000000000000000000' as const
  const { data: onChainPublishFee } = useReadContract({
    address: factoryAddress as `0x${string}`,
    abi: FACTORY_ABI,
    functionName: 'publishFee',
    chainId: chain.id,
    query: { enabled: Boolean(factoryAddress && factoryAddress !== zeroAddress) },
  })
  const publishFee = onChainPublishFee ?? getPublishFeeWei(network)
  const publishFeeLabel = formatEther(publishFee)
  const displayedCollections = view === 'archive' ? archivedCollections : collections

  const refetchAll = () => {
    void refetchActive()
    void refetchArchived()
  }

  const publish = async (collection: (typeof collections)[0]) => {
    if (!address) return
    setPublishingId(collection.id)
    try {
      const tokens = await listCollectionTokens(collection.id)
      const publishIssues = validateCollectionForPublish(collection, tokens.flatMap((t) => {
        if (t.token_id == null) return []
        return [{
          token_id: t.token_id,
          name: t.name ?? '',
          image_storage_path: t.image_storage_path,
        }]
      }))
      const publishError = firstIssueMessage(publishIssues)
      if (publishError) {
        toast.error(publishError)
        return
      }

      const burnConfig = {
        mintBurnBps: BigInt(collection.mint_burn_bps ?? 0),
        burnOnMint: collection.burn_on_mint,
        royaltyBurnBps: BigInt(collection.royalty_burn_bps ?? 0),
      }

      const hash = await writeContractAsync({
        address: factoryAddress,
        abi: FACTORY_ABI,
        functionName: 'deployCollection',
        args: [collection.name, collection.symbol, burnConfig, BigInt(collection.max_supply)],
        value: publishFee,
        chainId: chain.id,
      })

      const client = createPublicClient({ chain, transport: http() })
      const receipt: TransactionReceipt = await client.waitForTransactionReceipt({ hash })

      const contractAddress = resolveDeployedCollectionAddress(receipt, factoryAddress, address)

      toast.message('Uploading metadata…')
      await prepareCollectionMetadata(address, collection.id)

      toast.message('Configuring public mint (IMintable)…')
      const baseUri = await configurePublicMint(
        writeContractAsync,
        contractAddress as `0x${string}`,
        collection,
        chain.id,
      )

      await updateCollection(address, collection.id, {
        contractAddress,
        baseUri,
        status: 'published',
        chainId: chain.id,
      })

      await verifyPublishPayment(address, collection.id, hash, chain.id)

      toast.message('Verifying contract on block explorer…')
      try {
        const verification = await verifyCollectionContract(
          address,
          collection.id,
          contractAddress,
          chain.id,
        )
        if (verification.status === 'already_verified') {
          toast.success(`Collection published and already verified on ${chain.name}.`)
        } else {
          toast.success(`Collection published on ${chain.name}. Contract verification submitted.`)
        }
      } catch (verifyErr) {
        toast.message(
          `Collection published on ${chain.name}. Explorer verification will need a manual retry: ${
            verifyErr instanceof Error ? verifyErr.message : 'unknown error'
          }`,
        )
      }
      refetchAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishingId(null)
    }
  }

  const updatePublished = async (collection: (typeof collections)[0]) => {
    if (!address) return
    setUpdatingId(collection.id)
    try {
      toast.message('Saving metadata to Supabase storage…')
      await syncPublishedCollection(address, collection, writeContractAsync, chain.id)
      toast.success('Collection updated in Supabase and on-chain.')
      refetchAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setUpdatingId(null)
    }
  }

  const deleteDraft = async (collection: (typeof collections)[0]) => {
    if (!address) return
    const confirmed = window.confirm(
      `Delete draft "${collection.name}"? This removes all artwork and metadata and cannot be undone.`,
    )
    if (!confirmed) return

    setDeletingId(collection.id)
    try {
      await deleteCollection(address, collection.id)
      toast.success('Draft deleted')
      refetchAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  const archive = async (collection: Collection) => {
    if (!address) return
    const confirmed = window.confirm(
      `Archive "${collection.name}"? It will be hidden from your active dashboard and removed from the public minting panel.`,
    )
    if (!confirmed) return

    setArchivingId(collection.id)
    try {
      await archiveCollection(address, collection.id)
      toast.success('Collection archived')
      setExpandedId(null)
      refetchAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Archive failed')
    } finally {
      setArchivingId(null)
    }
  }

  const restore = async (collection: Collection) => {
    if (!address) return
    setRestoringId(collection.id)
    try {
      await restoreCollection(address, collection.id)
      toast.success('Collection restored')
      setExpandedId(null)
      setView('active')
      refetchAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setRestoringId(null)
    }
  }

  if (!isConnected) {
    return <Card><CardTitle>Connect wallet to view dashboard</CardTitle></Card>
  }

  if (!isAuthenticated) {
    return (
      <Card>
        <CardTitle>Sign in required</CardTitle>
        <WalletAuthButton />
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{view === 'archive' ? 'Archived Collections' : 'My Collections'}</h1>
          <p className="text-sm text-slate-400">
            {view === 'archive'
              ? `Archived collections on ${chain.name}`
              : `Active collections on ${chain.name}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={view === 'active' ? 'default' : 'outline'}
            onClick={() => {
              setView('active')
              setExpandedId(null)
            }}
          >
            Active ({collections.length})
          </Button>
          <Button
            variant={view === 'archive' ? 'default' : 'outline'}
            onClick={() => {
              setView('archive')
              setExpandedId(null)
            }}
          >
            Archive ({archivedCollections.length})
          </Button>
          {view === 'active' && (
            <Button asChild>
              <Link to="/create">New Collection</Link>
            </Button>
          )}
        </div>
      </div>

      {displayedCollections.length === 0 ? (
        <Card>
          <CardDescription>
            {view === 'archive'
              ? `No archived collections on ${chain.name}.`
              : `No collections on ${chain.name} yet. Switch network to test on testnet before going live on mainnet.`}
          </CardDescription>
        </Card>
      ) : (
        <div className="grid gap-4">
          {displayedCollections.map((collection) => {
            const expanded = expandedId === collection.id
            return (
              <CollectionAccordionItem
                key={collection.id}
                collection={collection}
                expanded={expanded}
                onToggle={() => setExpandedId(expanded ? null : collection.id)}
              >
                {collection.contract_address && view === 'active' && (
                  <p className="text-xs text-green-400">You own this collection contract</p>
                )}
                {view === 'archive' && (
                  <p className="text-sm text-slate-400">
                    Archived collections are hidden from your active dashboard and the public minting panel.
                    {collection.contract_address ? ' The on-chain contract is unchanged.' : ''}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {view === 'archive' ? (
                    <>
                      {collection.contract_address && (
                        <Button variant="outline" asChild>
                          <Link to={`/collection/${collection.contract_address}`}>View</Link>
                        </Button>
                      )}
                      <Button onClick={() => restore(collection)} disabled={restoringId === collection.id}>
                        {restoringId === collection.id ? 'Restoring…' : 'Restore'}
                      </Button>
                    </>
                  ) : (
                    <>
                      {collection.status === 'draft' && (
                        <>
                          <Button variant="outline" asChild>
                            <Link to={`/draft/${collection.id}/edit`}>Edit</Link>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => deleteDraft(collection)}
                            disabled={deletingId === collection.id}
                            className="border-red-900/60 text-red-300 hover:bg-red-950/40 hover:text-red-200"
                          >
                            {deletingId === collection.id ? 'Deleting…' : 'Delete'}
                          </Button>
                          <Button
                            onClick={() => publish(collection)}
                            disabled={publishingId === collection.id || confirming || factoryAddress === '0x0000000000000000000000000000000000000000'}
                          >
                            {publishingId === collection.id
                              ? 'Publishing...'
                              : `Publish (${publishFeeLabel} ETN)`}
                          </Button>
                        </>
                      )}
                      {collection.contract_address && (
                        <>
                          <Button variant="outline" asChild>
                            <Link to={`/collection/${collection.contract_address}`}>View</Link>
                          </Button>
                          <Button variant="outline" asChild>
                            <Link to={`/collection/${collection.contract_address}/edit`}>Edit</Link>
                          </Button>
                          <Button
                            onClick={() => updatePublished(collection)}
                            disabled={updatingId === collection.id || confirming}
                          >
                            {updatingId === collection.id ? 'Updating…' : 'Update'}
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => archive(collection)}
                        disabled={archivingId === collection.id}
                      >
                        {archivingId === collection.id ? 'Archiving…' : 'Archive'}
                      </Button>
                    </>
                  )}
                </div>
                {collection.contract_address && view === 'active' && (
                  <CollectionOwnerPanel
                    collection={collection}
                    chainId={chain.id}
                    onUpdated={() => void refetchAll()}
                  />
                )}
              </CollectionAccordionItem>
            )
          })}
        </div>
      )}
    </div>
  )
}
