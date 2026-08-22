import { useEffect, useState } from 'react'
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
} from '@/lib/create-collection-validation'
import { buildDraftRowsFromDb, buildEditableTokenRows, dedupeDbTokensByTokenId, getRowTokenId } from '@/lib/draft-token-rows'
import { assertStoragePathForCollection } from '@/lib/storage-paths'
import { collectionToForm, collectionToUpdatePayload, saveDraftCollection } from '@/lib/save-draft-collection'
import { syncPublishedCollection } from '@/lib/publish-collection'
import { updateCollection } from '@/lib/api'
import { validateImageFileAsync } from '@/lib/validate-upload-image'

export function EditPage() {
  const { address: contractAddress } = useParams()
  const { address } = useAccount()
  const { isAuthenticated } = useWalletAuth()
  const { chain } = useNetwork()
  const queryClient = useQueryClient()
  const { data: collection } = useCollection(contractAddress)
  const { data: dbTokens = [], refetch, isFetched } = useCollectionTokens(collection?.id)
  const { writeContractAsync } = useWriteContract()
  const [tokens, setTokens] = useState<DraftToken[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showOnMintPanel, setShowOnMintPanel] = useState(false)
  const [savingPanelSetting, setSavingPanelSetting] = useState(false)

  useEffect(() => {
    if (!collection || !isFetched || loaded) return
    setTokens(buildDraftRowsFromDb(dbTokens, collection.max_supply, collection.id))
    setShowOnMintPanel(collection.show_on_mint_panel ?? false)
    setLoaded(true)
  }, [collection, dbTokens, isFetched, loaded])

  const handleBulkImport = (imported: DraftToken[]) => {
    if (!collection) return
    const importedRows = buildEditableTokenRows(imported, collection.max_supply)
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
    toast.success('Imported data filled into editable rows below')
  }

  const saveMintPanelSetting = async (nextValue: boolean) => {
    if (!address || !collection) return
    const publicMint = Number(collection.mint_price_etn ?? 0) > 0
    if (nextValue && !publicMint) {
      toast.error('Enable public mint before listing on the NFT Minting Panel.')
      return
    }

    setSavingPanelSetting(true)
    try {
      await updateCollection(
        address,
        collection.id,
        collectionToUpdatePayload(collection, { showOnMintPanel: nextValue && publicMint }),
      )
      setShowOnMintPanel(nextValue && publicMint)
      toast.success(nextValue ? 'Collection added to the minting panel' : 'Collection removed from the minting panel')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update minting panel setting')
    } finally {
      setSavingPanelSetting(false)
    }
  }

  const saveAll = async (syncOnChain = false) => {
    if (!address || !collection) return
    setLoading(true)
    try {
      for (let i = 0; i < tokens.length; i++) {
        const file = tokens[i].file
        if (!file) continue
        const imageError = await validateImageFileAsync(file)
        if (imageError) {
          toast.error(`Token #${getRowTokenId(tokens[i], i)}: ${imageError}`)
          return
        }
      }

      await saveDraftCollection(
        address,
        collection.id,
        collectionToForm(collection),
        tokens,
        dbTokens,
        collection,
      )

      await queryClient.invalidateQueries({ queryKey: ['collection', contractAddress] })
      await queryClient.invalidateQueries({ queryKey: ['collection-tokens', collection.id] })
      const { data: freshTokens = [] } = await refetch()
      setTokens(buildDraftRowsFromDb(freshTokens, collection.max_supply, collection.id))

      if (syncOnChain && collection.contract_address) {
        toast.message('Syncing metadata on-chain…')
        await syncPublishedCollection(address, collection, writeContractAsync, chain.id)
        toast.success('Saved to Supabase and synced on-chain')
      } else {
        toast.success(
          collection.contract_address
            ? 'Saved to Supabase — click Update on the dashboard to sync on-chain'
            : 'Changes saved',
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setLoading(false)
    }
  }

  if (!collection) return <p>Loading...</p>
  if (collection.creator_wallet !== address?.toLowerCase() || !isAuthenticated) {
    return <Card><CardTitle>Only the collection creator can edit metadata.</CardTitle></Card>
  }

  const isPublished = Boolean(collection.contract_address)
  const publicMintEnabled = Number(collection.mint_price_etn ?? 0) > 0

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Edit {collection.name}</h1>
        <p className="text-sm text-slate-400">
          Update names, descriptions, images, and attributes. Bulk import fills the editable rows below.
          {isPublished
            ? ' Save here updates Supabase; use Update on the dashboard to push changes on-chain.'
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
        <label className={`flex items-start gap-3 ${!publicMintEnabled || savingPanelSetting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            className="mt-1"
            checked={showOnMintPanel}
            disabled={!publicMintEnabled || savingPanelSetting || !isPublished}
            onChange={(e) => saveMintPanelSetting(e.target.checked)}
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

      <BulkTokenUpload maxSupply={collection.max_supply} onImport={handleBulkImport} />

      <Card className="space-y-4">
        <CardTitle>Token metadata</CardTitle>
        <CardDescription>Edit any row, or bulk import numbered files to populate fields automatically.</CardDescription>

        {tokens.map((token, i) => (
          <DraftTokenRow
            key={`${token.dbTokenId ?? 'new'}-${getRowTokenId(token, i)}`}
            token={token}
            rowIndex={i}
            fieldErrors={{}}
            onChange={(next) => {
              const updated = [...tokens]
              updated[i] = next
              setTokens(updated)
            }}
          />
        ))}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => saveAll(false)} disabled={loading}>
          {loading ? 'Saving…' : 'Save to Supabase'}
        </Button>
        {isPublished && (
          <Button variant="outline" onClick={() => saveAll(true)} disabled={loading}>
            Save & sync on-chain
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
