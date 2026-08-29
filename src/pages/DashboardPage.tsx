import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { useChainWriteContract } from '@/hooks/useChainWriteContract'
import { createPublicClient, http, type TransactionReceipt } from 'viem'
import { toast } from 'sonner'
import { useState, useEffect, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useCollections, useArchivedCollections, useOtherCollections } from '@/hooks/useCollections'
import { WalletAuthButton, useWalletAuth } from '@/hooks/useWalletAuth'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { CollectionOwnerPanel } from '@/components/CollectionOwnerPanel'
import { GemShardsAdminCard } from '@/components/GemShardsAdminCard'
import { HolderPerksCard } from '@/components/HolderPerksCard'
import { DraftPublishButton } from '@/components/DraftPublishButton'
import { CollectionMetadataAdminActions } from '@/components/CollectionMetadataAdminActions'
import { WalletConnectButton } from '@/components/WalletConnectButton'
import { useNetwork } from '@/context/NetworkContext'
import { formatEther } from 'viem'
import { FACTORY_ABI, FACTORY_V2_ABI, getChainId, getPublishFeeWei, readRequiredPublishFeeWei, resolveDeployedCollectionAddress, isTreasuryWallet } from '@/lib/blockchain'
import { usePlatformConfig, resolveFactoryAddress, resolveFactoryV2Address } from '@/hooks/usePlatformConfig'
import { getCollectionTokenStandard, getFactoryDeployFunction, usesFactoryV2 } from '@/lib/collection-contract'
import { useAdmin } from '@/hooks/useAdmin'
import { useCreatorAccess } from '@/hooks/useCreatorAccess'
import { PUBLISH_FEE_SUPPLY_UNIT } from '@/lib/platform-fees'
import { firstIssueMessage, formatMintModeLabel, validateCollectionForPublish } from '@/lib/create-collection-validation'
import { updateCollection, verifyPublishPayment, verifyCollectionContract, deleteCollection, archiveCollection, restoreCollection } from '@/lib/api'
import { configurePublicMint, configureCollectionRoyalty, prepareCollectionMetadata, publishBatchCollection } from '@/lib/publish-collection'
import { listCollectionTokens } from '@/lib/collection-metadata'
import { OperationLockOverlay, type WalletApprovalStep } from '@/components/OperationLockOverlay'
import { useNavigationGuard } from '@/hooks/useNavigationGuard'
import { activateWalletStep, buildPublishWalletSteps, completeWalletSteps } from '@/lib/operation-progress'
import { cn } from '@/lib/utils'
import type { Collection } from '@/types/database'

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
}

function CollectionAccordionItem({
  collection,
  expanded,
  onToggle,
  disabled = false,
  subtitle,
  children,
}: {
  collection: Collection
  expanded: boolean
  onToggle: () => void
  disabled?: boolean
  subtitle?: string
  children: ReactNode
}) {
  const networkLabel =
    collection.chain_id === 5201420 ? 'Testnet' : collection.chain_id === 52014 ? 'Mainnet' : null

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={expanded}
        className={cn(
          'flex w-full items-start justify-between gap-4 p-6 text-left transition-colors',
          disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-slate-900/40',
        )}
      >
        <div className="min-w-0">
          <CardTitle className="truncate">{collection.name}</CardTitle>
          <CardDescription className="mt-1">
            {collection.status} · {formatMintModeLabel(collection.mint_mode)} · {collection.symbol}
            {networkLabel ? ` · ${networkLabel}` : ''}
          </CardDescription>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
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
  const { isAdmin } = useAdmin()
  const isTreasuryAdmin = isTreasuryWallet(address)
  const { hasDualHolderDiscount, holdings } = useCreatorAccess()
  const { network, chain } = useNetwork()
  const chainId = getChainId(network)
  const { data: collections = [], refetch: refetchActive } = useCollections(address, chainId, 'active')
  const { data: archivedCollections = [], refetch: refetchArchived } = useArchivedCollections(address, chainId)
  const { data: otherCollections = [], refetch: refetchOther } = useOtherCollections(
    address,
    chainId,
    isTreasuryAdmin,
  )
  const [view, setView] = useState<'active' | 'archive'>('active')
  const [holderPerksDismissed, setHolderPerksDismissed] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedOtherId, setExpandedOtherId] = useState<string | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [publishLock, setPublishLock] = useState<{
    active: boolean
    step: string
    progress: number | null
    walletSteps: WalletApprovalStep[]
  }>({ active: false, step: '', progress: null, walletSteps: [] })
  const isPublishing = publishLock.active
  useNavigationGuard(
    isPublishing,
    'Publishing is in progress. Leaving now may leave your collection in an incomplete state.',
  )
  const { writeContractAsync, data: txHash } = useChainWriteContract()
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
  const publishFeePerTen = onChainPublishFee ?? getPublishFeeWei(network)
  const publishFeeReady = Boolean(factoryAddress && factoryAddress !== zeroAddress)
  const displayedCollections = view === 'archive' ? archivedCollections : collections
  const showHolderPerks = !hasDualHolderDiscount && view === 'active' && !holderPerksDismissed

  useEffect(() => {
    if (!isConnected) {
      setHolderPerksDismissed(false)
    }
  }, [isConnected])

  const refetchAll = () => {
    void refetchActive()
    void refetchArchived()
    if (isTreasuryAdmin) void refetchOther()
  }

  const publish = async (collection: (typeof collections)[0]) => {
    if (!address) return
    const needsDeploy = !collection.contract_address
    const walletSteps = buildPublishWalletSteps(collection, needsDeploy)
    setPublishingId(collection.id)
    setPublishLock({
      active: true,
      step: 'Checking your collection…',
      progress: 5,
      walletSteps,
    })

    const onWalletStep = (label: string) => {
      setPublishLock((prev) => ({
        ...prev,
        step: `Approve in your wallet: ${label}`,
        walletSteps: activateWalletStep(prev.walletSteps, label),
      }))
    }

    try {
      const tokens = await listCollectionTokens(collection.id)
      const publishIssues = validateCollectionForPublish(collection, tokens.flatMap((t) => {
        if (t.token_id == null) return []
        return [{
          token_id: t.token_id,
          name: t.name ?? '',
          image_storage_path: t.image_storage_path,
        }]
      }), { dualHolderBurnExempt: hasDualHolderDiscount })
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

      const collectionName = collection.name.trim()
      const collectionSymbol = collection.symbol.trim().toUpperCase()
      if (!collectionName || !collectionSymbol) {
        toast.error('Collection name and symbol are required before publishing.')
        return
      }

      const client = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) })
      let deployTxHash = collection.publish_tx_hash ?? null
      let contractAddress = collection.contract_address as `0x${string}` | null

      if (!contractAddress) {
        if (!address) return
        const usesV2 = usesFactoryV2(collection)
        const tokenStandard = getCollectionTokenStandard(collection)
        const deployFactoryAddress = usesV2
          ? resolveFactoryV2Address(network, platformConfig, tokenStandard)
          : (factoryAddress as `0x${string}`)
        const deployAbi = usesV2 ? FACTORY_V2_ABI : FACTORY_ABI
        const deployFunctionName = getFactoryDeployFunction(collection)

        if (deployFactoryAddress === zeroAddress) {
          toast.error(
            usesV2
              ? 'Factory V2 is not configured yet. Deploy LaunchpadFactoryV2 and set factory_address_v2 in platform config.'
              : 'Factory is not configured for this network.',
          )
          return
        }

        const deployValue = await readRequiredPublishFeeWei(
          client,
          deployFactoryAddress,
          address,
          collection.max_supply,
          publishFeePerTen,
          holdings,
        )

        onWalletStep('Pay publish fee & deploy collection contract')
        setPublishLock((prev) => ({
          ...prev,
          step: `Approve the deploy transaction in your wallet (${formatEther(deployValue)} ETN)…`,
          progress: 15,
        }))
        const hash = await writeContractAsync({
          address: deployFactoryAddress,
          abi: deployAbi,
          functionName: deployFunctionName,
          args: [collectionName, collectionSymbol, burnConfig, BigInt(collection.max_supply)],
          value: deployValue,
          chainId: chain.id,
        })
        deployTxHash = hash

        setPublishLock((prev) => ({
          ...prev,
          step: 'Waiting for deploy confirmation on chain…',
          progress: 28,
        }))
        const receipt: TransactionReceipt = await client.waitForTransactionReceipt({ hash })
        contractAddress = resolveDeployedCollectionAddress(receipt, deployFactoryAddress, address)

        await updateCollection(address, collection.id, {
          contractAddress,
          chainId: chain.id,
        })
      } else {
        setPublishLock((prev) => ({
          ...prev,
          step: 'Resuming publish for an already-deployed contract…',
          progress: 30,
        }))
      }

      setPublishLock((prev) => ({
        ...prev,
        step: 'Uploading artwork & metadata…',
        progress: 35,
      }))
      await prepareCollectionMetadata(
        address,
        collection.id,
        collection.max_supply,
        (completed, total) => {
          setPublishLock((prev) => ({
            ...prev,
            step: `Uploading metadata ${completed} of ${total}…`,
            progress: 35 + (completed / total) * 30,
          }))
        },
      )

      setPublishLock((prev) => ({
        ...prev,
        step:
          collection.mint_mode === 'batch'
            ? 'Batch mint: approve the next transaction(s) in your wallet…'
            : 'Configure public mint: approve the next transaction(s) in your wallet…',
        progress: 68,
      }))
      const baseUri =
        collection.mint_mode === 'batch'
          ? await publishBatchCollection(
              address,
              collection,
              writeContractAsync,
              chain.id,
              contractAddress as `0x${string}`,
              {
                onWalletStep,
                onProgress: (completed, total) => {
                  setPublishLock((prev) => ({
                    ...prev,
                    step: `Batch minting ${completed} of ${total}…`,
                    progress: 68 + (completed / total) * 12,
                  }))
                },
              },
            )
          : await configurePublicMint(
              writeContractAsync,
              contractAddress as `0x${string}`,
              collection,
              chain.id,
              { onWalletStep },
            )

      setPublishLock((prev) => ({
        ...prev,
        step: 'Set marketplace royalty: approve in your wallet…',
        progress: 82,
      }))
      await configureCollectionRoyalty(
        writeContractAsync,
        contractAddress as `0x${string}`,
        collection.royalty_bps ?? 500,
        chain.id,
        { onWalletStep },
      )

      setPublishLock((prev) => ({
        ...prev,
        step: 'Saving collection status…',
        progress: 92,
        walletSteps: completeWalletSteps(prev.walletSteps),
      }))

      await updateCollection(address, collection.id, {
        contractAddress,
        baseUri,
        status: 'published',
        chainId: chain.id,
      })

      if (deployTxHash) {
        try {
          await verifyPublishPayment(address, collection.id, deployTxHash, chain.id)
        } catch (verifyPaymentErr) {
          const message = verifyPaymentErr instanceof Error ? verifyPaymentErr.message : ''
          if (!message.toLowerCase().includes('already used')) {
            throw verifyPaymentErr
          }
        }
      }

      setPublishLock((prev) => ({
        ...prev,
        step: 'Submitting contract verification to the block explorer…',
        progress: 96,
      }))
      try {
        const verification = await verifyCollectionContract(
          address,
          collection.id,
          contractAddress,
          chain.id,
        )
        if (verification.status === 'already_verified') {
          toast.success(`Collection published and verified on ${chain.name}.`)
        } else if (verification.status === 'name_mismatch') {
          toast.message(
            `Collection published. Explorer shows "${verification.explorerName}" but should be "${verification.displayName}". Contact Blockscout support to rename, or re-verify manually.`,
          )
        } else {
          toast.success(
            `Collection published on ${chain.name}. Contract verification submitted as "${verification.displayName ?? collection.name}".`,
          )
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
      setPublishLock({ active: false, step: '', progress: null, walletSteps: [] })
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

  const verifyOnExplorer = async (collection: Collection) => {
    if (!address || !collection.contract_address) return
    setVerifyingId(collection.id)
    try {
      const verification = await verifyCollectionContract(
        address,
        collection.id,
        collection.contract_address,
        chain.id,
      )
      if (verification.status === 'already_verified') {
        toast.success(
          verification.displayName
            ? `Contract verified on explorer as "${verification.displayName}".`
            : 'Contract is already verified on the block explorer.',
        )
      } else if (verification.status === 'name_mismatch') {
        toast.message(
          verification.message ??
            `Explorer shows "${verification.explorerName}" instead of "${verification.displayName}".`,
        )
      } else {
        toast.success(
          verification.displayName
            ? `Verification submitted. Explorer should show "${verification.displayName}".`
            : 'Contract verification submitted to the block explorer.',
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setVerifyingId(null)
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
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Creator Dashboard</h1>
          <p className="mt-2 text-sm text-slate-400">
            Manage your NFT collections on {chain.name}. Connect a wallet to view your drafts and published collections.
          </p>
        </div>
        <Card>
          <CardTitle>Connect wallet</CardTitle>
          <CardDescription className="mt-2">Connect an Electroneum wallet to sign in and manage your collections.</CardDescription>
          <div className="mt-4">
            <WalletConnectButton />
          </div>
        </Card>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Creator Dashboard</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in to view and manage your collections on {chain.name}.</p>
        </div>
        <Card>
          <CardTitle>Sign in required</CardTitle>
          <CardDescription className="mt-2">Authenticate with your connected wallet to access your dashboard.</CardDescription>
          <div className="mt-4">
            <WalletAuthButton />
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <OperationLockOverlay
        open={isPublishing}
        title="Publishing your collection"
        description="Publishing uploads metadata, configures your contract on-chain, and may submit explorer verification. This can take several minutes."
        currentStep={publishLock.step}
        progress={publishLock.progress}
        warning="Please keep this tab open and approve each wallet transaction when prompted. Do not click away or close the page until publishing finishes."
        walletSteps={publishLock.walletSteps}
      />
      {showHolderPerks && (
        <HolderPerksCard onDismiss={() => setHolderPerksDismissed(true)} />
      )}

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
            disabled={isPublishing}
            onClick={() => {
              setView('active')
              setExpandedId(null)
              setExpandedOtherId(null)
            }}
          >
            Active ({collections.length})
          </Button>
          <Button
            variant={view === 'archive' ? 'default' : 'outline'}
            disabled={isPublishing}
            onClick={() => {
              setView('archive')
              setExpandedId(null)
              setExpandedOtherId(null)
            }}
          >
            Archive ({archivedCollections.length})
          </Button>
          {view === 'active' && (
            <Button asChild disabled={isPublishing}>
              <Link to="/create" tabIndex={isPublishing ? -1 : undefined} aria-disabled={isPublishing}>
                New Collection
              </Link>
            </Button>
          )}
        </div>
      </div>

      <GemShardsAdminCard />

      {hasDualHolderDiscount && view === 'active' && (
        <Card className="border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-sm text-emerald-100">
            ElectroGem + Club Watch holder discount active: 50% off tiered publish fees ({formatEther(publishFeePerTen)}{' '}
            ETN per {PUBLISH_FEE_SUPPLY_UNIT} max supply).
          </p>
        </Card>
      )}

      {displayedCollections.length === 0 ? (
        <Card>
          <CardDescription>
            {view === 'archive'
              ? `No archived collections on ${chain.name}.`
              : `No collections on ${chain.name} yet.`}
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
                disabled={isPublishing}
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
                        <Button variant="outline" asChild disabled={isPublishing}>
                          <Link
                            to={`/collection/${collection.contract_address}`}
                            tabIndex={isPublishing ? -1 : undefined}
                            aria-disabled={isPublishing}
                          >
                            View
                          </Link>
                        </Button>
                      )}
                      <Button onClick={() => restore(collection)} disabled={isPublishing || restoringId === collection.id}>
                        {restoringId === collection.id ? 'Restoring…' : 'Restore'}
                      </Button>
                    </>
                  ) : (
                    <>
                      {collection.status === 'draft' && collection.symbol !== 'GSHARD' && (
                        <>
                          <Button variant="outline" asChild disabled={isPublishing}>
                              <Link
                                to={`/draft/${collection.id}/edit`}
                                tabIndex={isPublishing ? -1 : undefined}
                                aria-disabled={isPublishing}
                              >
                                Edit
                              </Link>
                            </Button>
                          <Button
                            variant="outline"
                            onClick={() => deleteDraft(collection)}
                            disabled={isPublishing || deletingId === collection.id}
                            className="border-red-900/60 text-red-300 hover:bg-red-950/40 hover:text-red-200"
                          >
                            {deletingId === collection.id ? 'Deleting…' : 'Delete'}
                          </Button>
                          <DraftPublishButton
                            collection={collection}
                            factoryAddress={factoryAddress as `0x${string}`}
                            chainId={chain.id}
                            fallbackPerTenWei={publishFeePerTen}
                            publishFeeReady={publishFeeReady}
                            isPublishing={isPublishing}
                            publishingId={publishingId}
                            confirming={confirming}
                            onPublish={publish}
                          />
                        </>
                      )}
                      {collection.status === 'draft' && collection.symbol === 'GSHARD' && (
                        <p className="w-full text-sm text-violet-200">
                          Use <span className="font-medium text-white">Publish Gem Shards</span> above when you are ready to go live.
                        </p>
                      )}
                      {collection.contract_address && (
                        <>
                          {isAdmin && (
                            <CollectionMetadataAdminActions
                              collection={collection}
                              disabled={isPublishing}
                              onComplete={() => void refetchAll()}
                            />
                          )}
                          {!isAdmin && !usesFactoryV2(collection) && (
                            <Button variant="outline" asChild disabled={isPublishing}>
                              <Link
                                to={`/collection/${collection.contract_address}/edit`}
                                tabIndex={isPublishing ? -1 : undefined}
                                aria-disabled={isPublishing}
                              >
                                Edit
                              </Link>
                            </Button>
                          )}
                          <Button variant="outline" asChild disabled={isPublishing}>
                            <Link
                              to={`/collection/${collection.contract_address}`}
                              tabIndex={isPublishing ? -1 : undefined}
                              aria-disabled={isPublishing}
                            >
                              View
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => verifyOnExplorer(collection)}
                            disabled={isPublishing || verifyingId === collection.id}
                          >
                            {verifyingId === collection.id ? 'Verifying…' : 'Verify on explorer'}
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => archive(collection)}
                        disabled={isPublishing || archivingId === collection.id}
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

      {view === 'active' && isTreasuryAdmin && (
        <section className="space-y-4 border-t border-slate-800 pt-8">
          <div>
            <h2 className="text-2xl font-bold">Other Collections</h2>
            <p className="text-sm text-slate-400">
              All launchpad collections on {chain.name}. Treasury admin can edit metadata and use owner tools.
            </p>
          </div>
          {otherCollections.length === 0 ? (
            <Card>
              <CardDescription>No other collections on {chain.name}.</CardDescription>
            </Card>
          ) : (
            <div className="grid gap-4">
              {otherCollections.map((collection) => {
                const expanded = expandedOtherId === collection.id
                return (
                  <CollectionAccordionItem
                    key={collection.id}
                    collection={collection}
                    expanded={expanded}
                    disabled={isPublishing}
                    subtitle={`Creator ${shortWallet(collection.creator_wallet)}`}
                    onToggle={() => setExpandedOtherId(expanded ? null : collection.id)}
                  >
                    {collection.contract_address && (
                      <p className="text-xs text-amber-300/90">
                        Treasury admin mode: on-chain actions require the collection owner wallet unless you own the
                        contract.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {collection.status === 'draft' && (
                        <Button variant="outline" asChild disabled={isPublishing}>
                          <Link
                            to={`/draft/${collection.id}/edit`}
                            tabIndex={isPublishing ? -1 : undefined}
                            aria-disabled={isPublishing}
                          >
                            Admin edit
                          </Link>
                        </Button>
                      )}
                      {collection.contract_address && (
                        <>
                          <CollectionMetadataAdminActions
                            collection={collection}
                            disabled={isPublishing}
                            onComplete={() => void refetchAll()}
                          />
                          <Button variant="outline" asChild disabled={isPublishing}>
                            <Link
                              to={`/collection/${collection.contract_address}`}
                              tabIndex={isPublishing ? -1 : undefined}
                              aria-disabled={isPublishing}
                            >
                              View
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => verifyOnExplorer(collection)}
                            disabled={isPublishing || verifyingId === collection.id}
                          >
                            {verifyingId === collection.id ? 'Verifying…' : 'Verify on explorer'}
                          </Button>
                        </>
                      )}
                    </div>
                    {collection.contract_address && (
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
        </section>
      )}
    </div>
  )
}
