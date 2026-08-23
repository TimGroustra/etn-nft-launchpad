import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAccount, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCollection, useCollectionTokens } from '@/hooks/useCollections'
import { useWalletAuth } from '@/hooks/useWalletAuth'
import { useNetwork } from '@/context/NetworkContext'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { CollectionWithdraw } from '@/components/CollectionWithdraw'
import { MetadataGuidancePanel } from '@/components/MetadataGuidancePanel'
import { BulkTokenUpload } from '@/components/BulkTokenUpload'
import { DraftTokenRow } from '@/components/DraftTokenRow'
import { FieldHint } from '@/components/form-fields'
import {
  type DraftToken,
  clampRoyaltyBurnPercent,
  formatPercentDisplay,
  isTokenRowEmpty,
  MIN_ROYALTY_BURN_PERCENT,
  sanitizePercentInput,
} from '@/lib/create-collection-validation'
import { buildDraftRowsFromDb, buildEditableTokenRows, dedupeDbTokensByTokenId, getRowTokenId, resolveBulkImportMaxSupply } from '@/lib/draft-token-rows'
import { assertStoragePathForCollection } from '@/lib/storage-paths'
import {
  buildEditCollectionForm,
  collectionToForm,
  collectionToUpdatePayload,
  getCollectionEditChanges,
  saveDraftCollection,
} from '@/lib/save-draft-collection'
import {
  configureCollectionBurnConfig,
  configureCollectionRoyalty,
  syncPublishedCollection,
} from '@/lib/publish-collection'
import { updateCollection } from '@/lib/api'
import { validateImageFileAsync } from '@/lib/validate-upload-image'
import { Input, Label } from '@/components/ui/input'
import { OperationLockOverlay, type WalletApprovalStep } from '@/components/OperationLockOverlay'
import { useNavigationGuard } from '@/hooks/useNavigationGuard'
import { activateWalletStep, completeWalletSteps, saveDraftProgress } from '@/lib/operation-progress'

export function EditPage() {
  const { collectionId, address: contractAddress } = useParams()
  const collectionKey = collectionId ?? contractAddress
  const { address } = useAccount()
  const { isAuthenticated } = useWalletAuth()
  const { chain } = useNetwork()
  const queryClient = useQueryClient()
  const { data: collection, refetch: refetchCollection } = useCollection(collectionKey)
  const { data: dbTokens = [], refetch: refetchTokens, isFetched } = useCollectionTokens(collection?.id)
  const { writeContractAsync } = useWriteContract()
  const [tokens, setTokens] = useState<DraftToken[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saveLock, setSaveLock] = useState<{
    active: boolean
    step: string
    progress: number | null
    walletSteps: WalletApprovalStep[]
  }>({ active: false, step: '', progress: null, walletSteps: [] })
  const isSaving = saveLock.active
  useNavigationGuard(
    isSaving,
    'Your collection is still saving. Leaving now may lose unsaved changes.',
  )
  const [showOnMintPanel, setShowOnMintPanel] = useState(false)
  const [royaltyPercent, setRoyaltyPercent] = useState('5')
  const [royaltyBurnPercent, setRoyaltyBurnPercent] = useState('2')

  useEffect(() => {
    if (!collection || !isFetched || loaded) return
    setTokens(buildDraftRowsFromDb(dbTokens, collection.max_supply, collection.id))
    setShowOnMintPanel(collection.show_on_mint_panel ?? false)
    const form = collectionToForm(collection)
    setRoyaltyPercent(form.royaltyPercent)
    setRoyaltyBurnPercent(form.royaltyBurnPercent)
    setLoaded(true)
  }, [collection, dbTokens, isFetched, loaded])

  const editChanges = useMemo(() => {
    if (!collection || !loaded) return null
    return getCollectionEditChanges(tokens, dbTokens, collection, {
      showOnMintPanel,
      royaltyPercent,
      royaltyBurnPercent,
    })
  }, [collection, dbTokens, loaded, royaltyBurnPercent, royaltyPercent, showOnMintPanel, tokens])

  const handleBulkImport = (imported: DraftToken[]) => {
    if (!collection) return
    const nextMaxSupply = resolveBulkImportMaxSupply(imported)
    if (nextMaxSupply === 0) return

    const importedRows = buildEditableTokenRows(imported, nextMaxSupply)
    const dedupedDbTokens = dedupeDbTokensByTokenId(dbTokens)
    const dbByTokenId = new Map(
      dedupedDbTokens
        .filter((token) => token.token_id != null)
        .map((token) => [token.token_id!, token]),
    )
    const existingById = new Map(
      tokens.filter((token) => token.tokenId != null).map((token) => [token.tokenId!, token]),
    )
    const merged = importedRows.map((row) => {
      const existing = row.tokenId != null ? existingById.get(row.tokenId) : undefined
      const dbRow = row.tokenId != null ? dbByTokenId.get(row.tokenId) : undefined
      const dbTokenId = existing?.dbTokenId ?? dbRow?.id
      const rawImagePath =
        row.existingImagePath ?? existing?.existingImagePath ?? dbRow?.image_storage_path ?? undefined
      const scopedImagePath =
        rawImagePath && !assertStoragePathForCollection(collection.id, rawImagePath)
          ? rawImagePath
          : undefined
      if (!existing && !dbRow) return row
      return {
        ...row,
        dbTokenId,
        existingImagePath: row.file ? undefined : scopedImagePath,
      }
    })
    setTokens(merged)
    if (nextMaxSupply !== collection.max_supply) {
      toast.message(`Imported ${imported.length} token(s). Max supply will be updated to ${nextMaxSupply} when you save.`)
    } else {
      toast.success('Imported data filled into editable rows below')
    }
  }

  const handleSave = async () => {
    if (!address || !collection || !editChanges) return
    if (!editChanges.hasChanges) {
      toast.message('No changes to save')
      return
    }

    const publicMintEnabled = Number(collection.mint_price_etn ?? 0) > 0
    if (showOnMintPanel && !publicMintEnabled) {
      toast.error('Enable public mint before listing on the NFT Minting Panel.')
      return
    }

    const walletSteps: WalletApprovalStep[] = []
    if (editChanges.needsOnChainSync) {
      walletSteps.push({ label: 'Sync on-chain metadata base URI' })
      if (publicMintEnabled) {
        walletSteps.push({ label: 'Update public mint settings' })
      }
    }
    if (editChanges.needsRoyaltyOnChainSync) {
      walletSteps.push({ label: 'Set marketplace royalty (EIP-2981)' })
    }
    if (editChanges.needsRoyaltyBurnOnChainSync) {
      walletSteps.push({ label: 'Update royalties CLUB burn config' })
    }

    const { step: validateStep, progress: validateProgress } = saveDraftProgress(0, 0, 'validating')
    setSaveLock({ active: true, step: validateStep, progress: validateProgress, walletSteps })

    const onWalletStep = (label: string) => {
      setSaveLock((prev) => ({
        ...prev,
        step: `Approve in your wallet: ${label}`,
        walletSteps: activateWalletStep(prev.walletSteps, label),
      }))
    }

    try {
      if (editChanges.metadataChanged || editChanges.royaltySettingsChanged) {
        for (let i = 0; i < tokens.length; i++) {
          const file = tokens[i].file
          if (!file) continue
          const imageError = await validateImageFileAsync(file)
          if (imageError) {
            toast.error(`Token #${getRowTokenId(tokens[i], i)}: ${imageError}`)
            setSaveLock({ active: false, step: '', progress: null, walletSteps: [] })
            return
          }
        }

        const activeTokens = tokens.filter((token) => !isTokenRowEmpty(token))
        const resolvedMaxSupply = resolveBulkImportMaxSupply(activeTokens) || collection.max_supply
        const activeCount = activeTokens.length

        setSaveLock((prev) => ({
          ...prev,
          ...saveDraftProgress(0, activeCount, 'uploading'),
        }))
        await saveDraftCollection(
          address,
          collection.id,
          buildEditCollectionForm(collection, {
            showOnMintPanel,
            royaltyPercent,
            royaltyBurnPercent,
            maxSupply: resolvedMaxSupply,
          }),
          tokens,
          dbTokens,
          collection,
          (completed, total) => {
            setSaveLock((prev) => ({
              ...prev,
              ...saveDraftProgress(completed, total, 'uploading'),
            }))
          },
        )
      } else if (editChanges.mintPanelChanged) {
        setSaveLock((prev) => ({
          ...prev,
          step: 'Updating mint panel settings…',
          progress: 50,
        }))
        await updateCollection(
          address,
          collection.id,
          collectionToUpdatePayload(collection, {
            showOnMintPanel: showOnMintPanel && publicMintEnabled,
          }),
        )
      }

      setSaveLock((prev) => ({
        ...prev,
        ...saveDraftProgress(0, 0, 'finishing'),
      }))

      await queryClient.invalidateQueries({ queryKey: ['collection', collectionKey] })
      await queryClient.invalidateQueries({ queryKey: ['collection-tokens', collection.id] })
      await queryClient.invalidateQueries({ queryKey: ['mint-panel-collections'] })

      const { data: freshCollection } = await refetchCollection()
      const { data: freshTokens = [] } = await refetchTokens()
      setTokens(buildDraftRowsFromDb(freshTokens, collection.max_supply, collection.id))
      setShowOnMintPanel(freshCollection?.show_on_mint_panel ?? showOnMintPanel)

      if (editChanges.needsOnChainSync && freshCollection) {
        setSaveLock((prev) => ({
          ...prev,
          step: 'Syncing metadata on-chain — approve wallet transaction(s)…',
          progress: 85,
        }))
        onWalletStep('Sync on-chain metadata base URI')
        await syncPublishedCollection(address, freshCollection, writeContractAsync, chain.id)
      }

      if (freshCollection?.contract_address) {
        const onChainAddress = freshCollection.contract_address as `0x${string}`
        if (editChanges.needsRoyaltyOnChainSync) {
          setSaveLock((prev) => ({
            ...prev,
            step: 'Set marketplace royalty — approve in your wallet…',
            progress: 92,
          }))
          onWalletStep('Set marketplace royalty (EIP-2981)')
          await configureCollectionRoyalty(
            writeContractAsync,
            onChainAddress,
            freshCollection.royalty_bps ?? 500,
            chain.id,
            { onWalletStep },
          )
        }
        if (editChanges.needsRoyaltyBurnOnChainSync) {
          setSaveLock((prev) => ({
            ...prev,
            step: 'Update royalties burn config — approve in your wallet…',
            progress: 96,
          }))
          onWalletStep('Update royalties CLUB burn config')
          await configureCollectionBurnConfig(
            writeContractAsync,
            onChainAddress,
            freshCollection,
            chain.id,
            freshCollection.royalty_burn_bps ?? 0,
          )
        }
      }

      setSaveLock((prev) => ({
        ...prev,
        walletSteps: completeWalletSteps(prev.walletSteps),
      }))

      if (
        editChanges.needsOnChainSync ||
        editChanges.needsRoyaltyOnChainSync ||
        editChanges.needsRoyaltyBurnOnChainSync
      ) {
        toast.success('Changes saved and synced on-chain')
      } else {
        toast.success('Changes saved')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaveLock({ active: false, step: '', progress: null, walletSteps: [] })
    }
  }

  if (!collection) return <p>Loading...</p>
  if (collection.status === 'archived') {
    return (
      <Card>
        <CardTitle>Collection archived</CardTitle>
        <CardDescription className="mt-2">
          Restore this collection from your dashboard archive before editing metadata.
        </CardDescription>
        <Button className="mt-4" asChild>
          <Link to="/dashboard">Go to dashboard</Link>
        </Button>
      </Card>
    )
  }
  if (collection.creator_wallet !== address?.toLowerCase() || !isAuthenticated) {
    return <Card><CardTitle>Only the collection creator can edit metadata.</CardTitle></Card>
  }

  const isPublished = Boolean(collection.contract_address)
  const publicMintEnabled = Number(collection.mint_price_etn ?? 0) > 0

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <OperationLockOverlay
        open={isSaving}
        title="Saving your changes"
        description="We are uploading images and metadata. Large collections can take several minutes. Published collections may also require wallet approvals for on-chain updates."
        currentStep={saveLock.step}
        progress={saveLock.progress}
        walletSteps={saveLock.walletSteps.length > 0 ? saveLock.walletSteps : undefined}
      />
      <div>
        <h1 className="text-2xl font-bold">Edit {collection.name}</h1>
        <p className="text-sm text-slate-400">
          Update names, descriptions, images, and attributes. Bulk import fills the editable rows below.
          {isPublished
            ? ' Save applies your changes to Supabase and syncs on-chain when metadata changed.'
            : ' Save your changes, then publish from the dashboard.'}
        </p>
      </div>

      <MetadataGuidancePanel compact showIpfs />
      {collection.contract_address && <CollectionWithdraw contractAddress={collection.contract_address} />}

      <Card className="space-y-4">
        <CardTitle>NFT Minting Panel</CardTitle>
        <CardDescription>
          Control whether this collection appears on the launchpad home page for public wallet minting.
        </CardDescription>
        <label className={`flex items-start gap-3 ${!publicMintEnabled || isSaving ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            className="mt-1"
            checked={showOnMintPanel}
            disabled={!publicMintEnabled || isSaving || !isPublished}
            onChange={(e) => setShowOnMintPanel(e.target.checked)}
          />
          <span>
            <span className="font-medium text-white">Show on NFT Minting Panel</span>
            <FieldHint>
              Requires public mint (IMintable) and a published contract. Collectors can mint directly from the home page.
            </FieldHint>
            {!publicMintEnabled && (
              <p className="mt-1 text-sm text-amber-200/90">
                Public mint is disabled for this collection. Enable it in the create flow before publishing, or republish
                with public mint settings.
              </p>
            )}
            {publicMintEnabled && !isPublished && (
              <p className="mt-1 text-sm text-amber-200/90">Publish the collection before it can appear on the minting panel.</p>
            )}
          </span>
        </label>
      </Card>

      <Card className="space-y-4">
        <CardTitle>Royalties</CardTitle>
        <CardDescription>
          Marketplace resale royalty is enforced on-chain via EIP-2981. Royalties burn applies when you withdraw from
          the contract.
        </CardDescription>
        <div>
          <Label htmlFor="edit-royalty-percent">Resale royalty (%)</Label>
          <Input
            id="edit-royalty-percent"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={royaltyPercent}
            onChange={(e) => setRoyaltyPercent(sanitizePercentInput(e.target.value))}
            onBlur={() => setRoyaltyPercent(formatPercentDisplay(royaltyPercent))}
            disabled={isSaving}
          />
          <FieldHint>
            0–100% on secondary sales. Leave room for the marketplace fee (~3% on ElectroSwap).{' '}
            {isPublished ? 'Saved to DB and synced on-chain when you click Save.' : 'Applied on publish.'}
          </FieldHint>
        </div>
        <div>
          <Label htmlFor="edit-royalty-burn-percent">Burn from resales (%)</Label>
          <Input
            id="edit-royalty-burn-percent"
            type="number"
            min={MIN_ROYALTY_BURN_PERCENT}
            max={100}
            step="0.01"
            value={royaltyBurnPercent}
            onChange={(e) => setRoyaltyBurnPercent(sanitizePercentInput(e.target.value))}
            onBlur={() => setRoyaltyBurnPercent(clampRoyaltyBurnPercent(royaltyBurnPercent))}
            disabled={isSaving}
          />
          <FieldHint>
            {MIN_ROYALTY_BURN_PERCENT}–100% of contract royalties swapped to CLUB and burned on resale income.
          </FieldHint>
        </div>
      </Card>

      <BulkTokenUpload maxSupply={collection.max_supply} onImport={handleBulkImport} disabled={isSaving} />

      <Card className="space-y-4">
        <CardTitle>Token metadata</CardTitle>
        <CardDescription>Edit any row, or bulk import numbered files to populate fields automatically.</CardDescription>

        {tokens.map((token, i) => (
          <DraftTokenRow
            key={`${token.dbTokenId ?? 'new'}-${getRowTokenId(token, i)}`}
            token={token}
            rowIndex={i}
            fieldErrors={{}}
            disabled={isSaving}
            onChange={(next) => {
              const updated = [...tokens]
              updated[i] = next
              setTokens(updated)
            }}
          />
        ))}
      </Card>

      <div className="flex flex-wrap gap-2">
        <p className="w-full text-sm leading-relaxed text-amber-200/90">
          Saving uploads every image and metadata file. Large collections can take several minutes — keep this tab open
          until the progress bar finishes.
        </p>
        <Button onClick={handleSave} disabled={isSaving || !editChanges?.hasChanges}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
        {!isSaving && (
          <Button variant="outline" asChild>
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
