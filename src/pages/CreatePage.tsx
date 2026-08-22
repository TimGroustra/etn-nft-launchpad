import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input, Label, Textarea } from '@/components/ui/input'
import { WalletAuthButton, useWalletAuth } from '@/hooks/useWalletAuth'
import { useCollection, useCollectionTokens } from '@/hooks/useCollections'
import { createCollection, deleteCollection } from '@/lib/api'
import { useNetwork } from '@/context/NetworkContext'
import { getChainId } from '@/lib/blockchain'
import {
  canEnablePublicMint,
  getCompleteTokens,
  getTokenAttributesForSave,
  inferDraftResumeStep,
  isTokenRowComplete,
  issuesToFieldMap,
  MIN_PUBLIC_MINT_ETN,
  sanitizeFormForMode,
  validateBeforeSave,
  validateCreateStep,
  firstIssueMessage,
  formatPercentDisplay,
  percentToBps,
  sanitizePercentInput,
  type CreateCollectionForm,
  type DraftToken,
  type MintMode,
} from '@/lib/create-collection-validation'
import { buildEditableTokenRows, buildDraftRowsFromDb, getRowTokenId } from '@/lib/draft-token-rows'
import { collectionToForm, saveDraftCollection } from '@/lib/save-draft-collection'
import { IMAGE_RULES, validateImageFileAsync } from '@/lib/validate-upload-image'
import { MetadataGuidancePanel } from '@/components/MetadataGuidancePanel'
import { BulkTokenUpload } from '@/components/BulkTokenUpload'
import { DraftTokenRow } from '@/components/DraftTokenRow'
import { FieldError, FieldHint } from '@/components/form-fields'
import { NftPreviewCarousel, type NftPreviewItem } from '@/components/NftPreviewCarousel'
import { RoyaltyInfoPanel } from '@/components/RoyaltyInfoPanel'
import { buildDraftMetadataPreview } from '@/lib/nft-metadata'
import { getPublicImageUrl } from '@/lib/supabase'

const STEPS = ['Details', 'Minting', 'Burns', 'Artwork', 'Preview', 'Save']

function CreateHero() {
  return (
    <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-10">
      <h1 className="text-4xl font-bold">Launch editable NFT collections on Electroneum</h1>
      <p className="mt-3 max-w-2xl text-slate-400">
        Upload artwork, configure CLUB burns, pay ETN to publish, and keep metadata fully editable after launch.
        Images and metadata are stored in Supabase — update the token URI anytime to point at your own storage.
      </p>
      <div className="mt-6 flex gap-3">
        <Button size="lg" className="pointer-events-none">
          Create Collection
        </Button>
        <Button variant="outline" asChild size="lg">
          <Link to="/dashboard">My Dashboard</Link>
        </Button>
      </div>
    </section>
  )
}

function OptionCard({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/40'
          : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
      }`}
    >
      <p className="font-medium text-white">{title}</p>
      <FieldHint>{description}</FieldHint>
    </button>
  )
}

function ToggleRow({
  checked,
  onChange,
  label,
  description,
  disabled,
  disabledReason,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description: string
  disabled?: boolean
  disabledReason?: string
}) {
  return (
    <div className={`rounded-xl border border-slate-800 p-4 ${disabled ? 'opacity-60' : ''}`}>
      <label className={`flex items-start gap-3 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          className="mt-1"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          <span className="font-medium text-white">{label}</span>
          <FieldHint>{description}</FieldHint>
          {disabled && disabledReason && <p className="mt-1 text-sm text-amber-200/90">{disabledReason}</p>}
        </span>
      </label>
    </div>
  )
}

const INITIAL_FORM: CreateCollectionForm = {
  name: '',
  symbol: '',
  description: '',
  mintMode: 'lazy',
  maxSupply: 100,
  mintBurnPercent: '0',
  burnOnMint: false,
  royaltyBurnPercent: '0',
  mintPriceEtn: String(MIN_PUBLIC_MINT_ETN),
  maxMintPerWallet: '0',
  enablePublicMint: false,
  showOnMintPanel: false,
}

export function CreatePage() {
  const { collectionId: editCollectionId } = useParams()
  const isEditingDraft = Boolean(editCollectionId)
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const { isAuthenticated } = useWalletAuth()
  const { network, chain } = useNetwork()
  const { data: existingCollection, isLoading: loadingCollection, isFetched: collectionFetched } =
    useCollection(editCollectionId)
  const {
    data: existingDbTokens = [],
    isLoading: loadingTokens,
    isFetched: tokensFetched,
  } = useCollectionTokens(editCollectionId)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [validatingImages, setValidatingImages] = useState(false)
  const [collectionId, setCollectionId] = useState<string | null>(editCollectionId ?? null)
  const [stepError, setStepError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<CreateCollectionForm>(INITIAL_FORM)
  const [tokens, setTokens] = useState<DraftToken[]>([
    { tokenId: 1, name: 'Token #1', description: '', file: null, attributes: [] },
  ])
  const [previewItems, setPreviewItems] = useState<NftPreviewItem[]>([])
  const [loadedDraft, setLoadedDraft] = useState(!isEditingDraft)

  useEffect(() => {
    if (!isEditingDraft || !collectionFetched || !tokensFetched || loadedDraft) return

    if (!existingCollection) {
      toast.error('Draft not found.')
      navigate('/dashboard')
      return
    }

    if (existingCollection.status !== 'draft') {
      toast.error('Only draft collections can be edited here.')
      navigate('/dashboard')
      return
    }

    const loadedTokens = buildDraftRowsFromDb(
      existingDbTokens,
      existingCollection.max_supply,
      existingCollection.id,
    )
    const loadedForm = sanitizeFormForMode(collectionToForm(existingCollection), loadedTokens)

    setForm(loadedForm)
    setTokens(loadedTokens)
    setCollectionId(existingCollection.id)
    setStep(inferDraftResumeStep(loadedForm, loadedTokens))
    setLoadedDraft(true)
  }, [
    isEditingDraft,
    collectionFetched,
    tokensFetched,
    existingCollection,
    existingDbTokens,
    loadedDraft,
    navigate,
  ])

  const completeCount = getCompleteTokens(tokens).length
  const publicMintAllowed = canEnablePublicMint(form, tokens)

  useEffect(() => {
    const preview: NftPreviewItem[] = []
    const objectUrls: string[] = []

    tokens.forEach((token, rowIndex) => {
      if (!isTokenRowComplete(token)) return
      let imageUrl: string | null = null
      if (token.file) {
        imageUrl = URL.createObjectURL(token.file)
        objectUrls.push(imageUrl)
      } else if (token.existingImagePath) {
        imageUrl = getPublicImageUrl(token.existingImagePath)
      }
      preview.push({
        tokenId: getRowTokenId(token, rowIndex),
        name: token.name.trim(),
        description: token.description,
        imageUrl,
        metadata: buildDraftMetadataPreview({
          name: token.name,
          description: token.description,
          attributes: getTokenAttributesForSave(token),
        }),
      })
    })

    setPreviewItems(preview)
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [tokens])

  const currentStepIssues = useMemo(
    () => validateCreateStep(step, form, tokens),
    [step, form, tokens],
  )

  const update = <K extends keyof CreateCollectionForm>(key: K, value: CreateCollectionForm[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'enablePublicMint' && value === false) {
        next.burnOnMint = false
        next.showOnMintPanel = false
      }
      return sanitizeFormForMode(next, tokens)
    })
    setStepError(null)
    setFieldErrors({})
  }

  const setMintMode = (mintMode: MintMode) => {
    setForm((prev) =>
      sanitizeFormForMode(
        {
          ...prev,
          mintMode,
          maxSupply: mintMode === 'batch' ? Math.max(prev.maxSupply, completeCount || 1) : prev.maxSupply,
        },
        tokens,
      ),
    )
    setStepError(null)
    setFieldErrors({})
  }

  const setTokensAndSync = (next: DraftToken[]) => {
    setTokens(next)
    setForm((prev) => sanitizeFormForMode(prev, next))
    setStepError(null)
    setFieldErrors({})
  }

  const applyStepValidation = (issues: ReturnType<typeof validateCreateStep>) => {
    if (issues.length === 0) {
      setFieldErrors({})
      setStepError(null)
      return true
    }
    setFieldErrors(issuesToFieldMap(issues))
    setStepError(firstIssueMessage(issues))
    return false
  }

  const goNext = async () => {
    const issues = validateCreateStep(step, form, tokens)
    if (!applyStepValidation(issues)) return

    if (step === 3) {
      setValidatingImages(true)
      try {
        for (let i = 0; i < tokens.length; i++) {
          const file = tokens[i].file
          if (!file) continue
          const imageError = await validateImageFileAsync(file)
          if (imageError) {
            setFieldErrors({ [`token.${getRowTokenId(tokens[i], i)}.image`]: imageError })
            setStepError(imageError)
            return
          }
        }
      } finally {
        setValidatingImages(false)
      }
    }

    setStep((s) => s + 1)
  }

  const saveDraft = async () => {
    if (!address) return
    const issues = validateBeforeSave(form, tokens)
    if (!applyStepValidation(issues)) {
      toast.error(firstIssueMessage(issues))
      return
    }

    setValidatingImages(true)
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
    } finally {
      setValidatingImages(false)
    }

    setLoading(true)
    try {
      if (isEditingDraft && collectionId) {
        await saveDraftCollection(
          address,
          collectionId,
          form,
          tokens,
          existingDbTokens,
          existingCollection ?? undefined,
        )
        toast.success('Draft updated')
      } else {
        const sanitized = sanitizeFormForMode(form, tokens)
        const collection = await createCollection(address, {
          name: sanitized.name.trim(),
          symbol: sanitized.symbol.trim().toUpperCase(),
          description: sanitized.description,
          mintMode: sanitized.mintMode,
          maxSupply: sanitized.maxSupply,
          mintBurnBps: percentToBps(Number(sanitized.mintBurnPercent)),
          burnOnMint: sanitized.burnOnMint,
          royaltyBurnBps: Math.min(10000, Math.max(0, Math.round(Number(sanitized.royaltyBurnPercent) * 100))),
          mintPriceEtn: sanitized.enablePublicMint ? Number(sanitized.mintPriceEtn) : 0,
          maxMintPerWallet: Number(sanitized.maxMintPerWallet) || 0,
          showOnMintPanel: sanitized.enablePublicMint && sanitized.showOnMintPanel,
          chainId: getChainId(network),
        })
        setCollectionId(collection.id)
        await saveDraftCollection(address, collection.id, form, tokens, [])
        toast.success('Draft saved')
      }
      navigate('/dashboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save draft')
    } finally {
      setLoading(false)
    }
  }

  const addTokenRow = () => {
    const nextId = getRowTokenId(tokens[tokens.length - 1] ?? { tokenId: 0 } as DraftToken, tokens.length - 1) + 1
    const next = [
      ...tokens,
      { tokenId: nextId, name: `Token #${nextId}`, description: '', file: null, attributes: [] },
    ]
    if (form.mintMode === 'batch' && !form.enablePublicMint) {
      setForm((prev) => sanitizeFormForMode({ ...prev, maxSupply: next.length }, next))
    }
    setTokensAndSync(next)
  }

  const fillRowsToMaxSupply = () => {
    if (tokens.length >= form.maxSupply) return
    const extra = Array.from({ length: form.maxSupply - tokens.length }, (_, j) => ({
      tokenId: tokens.length + j + 1,
      name: `Token #${tokens.length + j + 1}`,
      description: '',
      file: null,
      attributes: [] as DraftToken['attributes'],
    }))
    setTokensAndSync([...tokens, ...extra])
  }

  const handleBulkImport = (imported: DraftToken[]) => {
    const rows = buildEditableTokenRows(imported, form.maxSupply)
    const existingById = new Map(
      tokens.filter((token) => token.tokenId != null).map((token) => [token.tokenId!, token]),
    )
    const merged = rows.map((row) => {
      const existing = row.tokenId != null ? existingById.get(row.tokenId) : undefined
      if (!existing) return row
      return {
        ...row,
        dbTokenId: existing.dbTokenId,
        existingImagePath: row.file ? undefined : (row.existingImagePath ?? existing.existingImagePath),
      }
    })
    setTokensAndSync(merged)
    if (form.mintMode === 'batch' && !form.enablePublicMint) {
      setForm((prev) => sanitizeFormForMode({ ...prev, maxSupply: merged.length }, merged))
    }
  }

  const handleDeleteDraft = async () => {
    if (!address || !collectionId || !isEditingDraft) return
    const confirmed = window.confirm(
      `Delete draft "${form.name || 'this collection'}"? This removes all artwork and metadata and cannot be undone.`,
    )
    if (!confirmed) return

    setLoading(true)
    try {
      await deleteCollection(address, collectionId)
      toast.success('Draft deleted')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="space-y-8">
        {!isEditingDraft && <CreateHero />}
        <Card>
          <CardTitle>Connect your wallet</CardTitle>
          <CardDescription className="mt-2">Connect an Electroneum wallet to create a collection.</CardDescription>
        </Card>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-8">
        {!isEditingDraft && <CreateHero />}
        <Card>
          <CardTitle>Sign in with wallet</CardTitle>
          <CardDescription className="mt-2">Authenticate to create and manage collections.</CardDescription>
          <div className="mt-4">
            <WalletAuthButton />
          </div>
        </Card>
      </div>
    )
  }

  if (isEditingDraft && (loadingCollection || loadingTokens || !loadedDraft)) {
    return <Card><CardTitle>Loading draft…</CardTitle></Card>
  }

  const isBatch = form.mintMode === 'batch'
  const nextDisabled = validatingImages || currentStepIssues.length > 0

  return (
    <div className="space-y-8">
      {!isEditingDraft && <CreateHero />}
      <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-3xl font-bold">{isEditingDraft ? 'Edit Draft Collection' : 'Create Collection'}</h2>
        <p className="text-slate-400">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
        <p className="text-sm text-slate-500">Creating on {chain.name}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`rounded-full px-3 py-1 text-xs ${i <= step ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
          >
            {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card className="space-y-4">
          <div>
            <Label>Collection name</Label>
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="My Collection" />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label>Symbol</Label>
            <Input
              value={form.symbol}
              onChange={(e) => update('symbol', e.target.value.toUpperCase())}
              placeholder="MYC"
              maxLength={12}
            />
            <FieldHint>Short ticker shown on marketplaces (2–12 letters or numbers).</FieldHint>
            <FieldError message={fieldErrors.symbol} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Tell collectors what this collection is about…"
            />
            <FieldError message={fieldErrors.description} />
          </div>
          <div>
            <Label>Max supply</Label>
            <Input
              type="number"
              min={1}
              value={form.maxSupply}
              onChange={(e) => update('maxSupply', Number(e.target.value))}
            />
            <FieldHint>Total number of NFTs that can ever exist in this collection.</FieldHint>
            <FieldError message={fieldErrors.maxSupply} />
          </div>
          {stepError && !Object.keys(fieldErrors).length && <FieldError message={stepError} />}
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-5">
          <div>
            <Label>How should minting work?</Label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <OptionCard
                selected={form.mintMode === 'lazy'}
                title="Lazy mint"
                description="Upload artwork first, then mint tokens yourself from the dashboard when you are ready."
                onClick={() => setMintMode('lazy')}
              />
              <OptionCard
                selected={form.mintMode === 'batch'}
                title="Batch mint at publish"
                description="Every token you upload is minted to your wallet automatically when you publish."
                onClick={() => setMintMode('batch')}
              />
            </div>
          </div>

          <ToggleRow
            checked={form.enablePublicMint}
            disabled={!publicMintAllowed}
            disabledReason={
              isBatch && !publicMintAllowed
                ? 'Batch mint already fills max supply. Raise max supply on step 1 or add fewer tokens on Artwork before enabling public mint.'
                : undefined
            }
            onChange={(enablePublicMint) => update('enablePublicMint', enablePublicMint)}
            label="Enable public mint (IMintable)"
            description="Lets collectors mint via any marketplace that supports IMintable (e.g. ElectroSwap). Requires at least 1 ETN and complete metadata for every token."
          />

          {form.enablePublicMint && (
            <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div>
                <Label>Public mint price (ETN)</Label>
                <Input
                  type="number"
                  min={MIN_PUBLIC_MINT_ETN}
                  step="0.01"
                  value={form.mintPriceEtn}
                  onChange={(e) => update('mintPriceEtn', e.target.value)}
                />
                <FieldHint>Minimum {MIN_PUBLIC_MINT_ETN} ETN per NFT on supported marketplaces.</FieldHint>
                <FieldError message={fieldErrors.mintPriceEtn} />
              </div>
              <div>
                <Label>Max mints per wallet</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.maxMintPerWallet}
                  onChange={(e) => update('maxMintPerWallet', e.target.value)}
                />
                <FieldHint>Limit how many NFTs one wallet can mint via public mint. Use 0 for no limit.</FieldHint>
                <FieldError message={fieldErrors.maxMintPerWallet} />
              </div>
            </div>
          )}

          <ToggleRow
            checked={form.showOnMintPanel}
            disabled={!form.enablePublicMint}
            disabledReason="Enable public mint (IMintable) before listing on the home page minting panel."
            onChange={(showOnMintPanel) => update('showOnMintPanel', showOnMintPanel)}
            label="Show on NFT Minting Panel"
            description="List this collection on the launchpad home page so anyone can mint directly from their wallet."
          />

          {form.enablePublicMint && (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-100">
              Public mint requires artwork and metadata for all {form.maxSupply} tokens before you can save or publish.
            </div>
          )}

          {isBatch && !form.enablePublicMint && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              Batch mode without public mint: upload exactly {form.maxSupply} complete token(s). Max supply adjusts to
              match your artwork count.
            </div>
          )}

          {isBatch && form.enablePublicMint && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              Batch + public mint: upload metadata for all {form.maxSupply} tokens. Tokens you batch mint at publish
              plus any unsold supply share the same public mint price.
            </div>
          )}

          <FieldError message={fieldErrors.enablePublicMint || fieldErrors.showOnMintPanel || fieldErrors.tokens || stepError} />
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4">
          <div>
            <Label>Royalties burn (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.royaltyBurnPercent}
              onChange={(e) => update('royaltyBurnPercent', sanitizePercentInput(e.target.value))}
              onBlur={() => update('royaltyBurnPercent', formatPercentDisplay(form.royaltyBurnPercent))}
            />
            <FieldHint>
              Of ETN royalties received by your collection contract, this percentage is swapped to CLUB and burned.
              The marketplace royalty rate itself is fixed at 5% on-chain (EIP-2981) — not set in metadata JSON.
            </FieldHint>
            <FieldError message={fieldErrors.royaltyBurnPercent} />
          </div>

          <ToggleRow
            checked={form.burnOnMint}
            disabled={!form.enablePublicMint}
            disabledReason="Mint CLUB burn only applies when public mint (IMintable) is enabled."
            onChange={(burnOnMint) => update('burnOnMint', burnOnMint)}
            label="Burn CLUB on public mint"
            description="When someone mints via IMintable on a marketplace, a percentage of their ETN payment is swapped to CLUB and burned."
          />

          {form.burnOnMint && (
            <div>
              <Label>Mint burn (% of mint price)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.mintBurnPercent}
                onChange={(e) => update('mintBurnPercent', sanitizePercentInput(e.target.value))}
                onBlur={() => update('mintBurnPercent', formatPercentDisplay(form.mintBurnPercent))}
              />
              <FieldHint>
                Percentage of each public mint payment swapped to CLUB and burned (e.g. 10% of a 5 ETN mint = 0.5 ETN).
              </FieldHint>
              <FieldError message={fieldErrors.mintBurnPercent} />
            </div>
          )}

          <FieldError message={fieldErrors.burnOnMint || stepError} />
        </Card>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <MetadataGuidancePanel />
          <BulkTokenUpload maxSupply={form.maxSupply} onImport={handleBulkImport} />
          <Card className="space-y-4">
            <div>
              <CardTitle>{isBatch ? 'Upload your full collection' : 'Upload artwork'}</CardTitle>
              <FieldHint>
                Images: PNG, JPEG, WebP, or GIF · {IMAGE_RULES.minWidth}×{IMAGE_RULES.minHeight}px minimum · 10 MB max.
                Bulk import fills the rows below — you can edit every field before saving.
                {form.enablePublicMint
                  ? ` All ${form.maxSupply} rows must be complete (name + image).`
                  : isBatch
                    ? ` Upload exactly ${form.maxSupply} complete row(s) for batch mint.`
                    : ' At least one complete row is required for lazy mint.'}
              </FieldHint>
            </div>

            {form.enablePublicMint && tokens.length < form.maxSupply && (
              <Button variant="outline" onClick={fillRowsToMaxSupply}>
                Add {form.maxSupply - tokens.length} row(s) to match max supply
              </Button>
            )}

            {tokens.map((token, i) => (
              <DraftTokenRow
                key={`${token.dbTokenId ?? 'new'}-${getRowTokenId(token, i)}`}
                token={token}
                rowIndex={i}
                fieldErrors={fieldErrors}
                onChange={(next) => {
                  const updated = [...tokens]
                  updated[i] = next
                  setTokensAndSync(updated)
                }}
              />
            ))}

            {!isBatch && tokens.length < form.maxSupply && (
              <Button variant="outline" onClick={addTokenRow}>
                Add another token ({completeCount}/{form.maxSupply} complete)
              </Button>
            )}

            {isBatch && tokens.length < form.maxSupply && (
              <Button variant="outline" onClick={addTokenRow}>
                Add token ({tokens.length} / {form.maxSupply} max)
              </Button>
            )}

            <FieldError message={fieldErrors.tokens || stepError} />
          </Card>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <div>
              <CardTitle>Preview your NFTs</CardTitle>
              <FieldHint>
                Click through each token to verify the artwork and metadata JSON before saving. This is exactly what
                collectors and marketplaces will see (royalties are handled separately on-chain).
              </FieldHint>
            </div>
            <NftPreviewCarousel tokens={previewItems} collectionName={form.name.trim() || 'Collection'} />
          </Card>

          <RoyaltyInfoPanel creatorWallet={address} royaltyBurnPercent={form.royaltyBurnPercent} />

          <Card className="space-y-3">
            <CardTitle>Collection settings</CardTitle>
            <CardDescription>{form.description || 'No description'}</CardDescription>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-4 border-b border-slate-800 py-2">
                <dt className="text-slate-400">Collection</dt>
                <dd>
                  {form.name} ({form.symbol})
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-800 py-2">
                <dt className="text-slate-400">Mint mode</dt>
                <dd>{isBatch ? 'Batch at publish' : 'Lazy mint'}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-800 py-2">
                <dt className="text-slate-400">Max supply</dt>
                <dd>{form.maxSupply}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-800 py-2">
                <dt className="text-slate-400">Public mint</dt>
                <dd>
                  {form.enablePublicMint
                    ? `${form.mintPriceEtn} ETN${Number(form.maxMintPerWallet) > 0 ? ` · max ${form.maxMintPerWallet}/wallet` : ''}`
                    : 'Disabled'}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-800 py-2">
                <dt className="text-slate-400">Minting panel</dt>
                <dd>{form.enablePublicMint && form.showOnMintPanel ? 'Visible on home page' : 'Hidden'}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-800 py-2">
                <dt className="text-slate-400">Royalties burn</dt>
                <dd>{formatPercentDisplay(form.royaltyBurnPercent)}% of contract royalties</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-800 py-2">
                <dt className="text-slate-400">Mint CLUB burn</dt>
                <dd>{form.burnOnMint ? `${formatPercentDisplay(form.mintBurnPercent)}% of mint price → CLUB burn` : 'Off'}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-slate-400">Artwork</dt>
                <dd>
                  {completeCount} complete / {form.maxSupply} required
                  {form.enablePublicMint ? ' for public mint' : isBatch ? ' for batch mint' : ''}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      )}

      {step === 5 && (
        <Card>
          <CardTitle>{isEditingDraft ? 'Save draft changes' : 'Save draft'}</CardTitle>
          <CardDescription className="mt-2">
            {isEditingDraft
              ? 'Save your edits, then publish from the dashboard when you are ready.'
              : 'Save your collection, then publish from the dashboard. We deploy the contract, upload metadata, and configure public mint (IMintable) for you.'}
          </CardDescription>
          <Button className="mt-4" onClick={saveDraft} disabled={loading || validatingImages}>
            {loading ? 'Saving…' : validatingImages ? 'Validating images…' : isEditingDraft ? 'Save changes' : 'Save draft'}
          </Button>
          {isEditingDraft && (
            <Button variant="outline" className="mt-3 ml-3" asChild>
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          )}
          {isEditingDraft && (
            <Button
              variant="outline"
              className="mt-3 ml-3 border-red-900/60 text-red-300 hover:bg-red-950/40 hover:text-red-200"
              onClick={handleDeleteDraft}
              disabled={loading}
            >
              Delete draft
            </Button>
          )}
          {collectionId && !isEditingDraft && (
            <p className="mt-2 text-sm text-green-400">Draft saved. Go to dashboard to publish.</p>
          )}
        </Card>
      )}

      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => {
            setStepError(null)
            setFieldErrors({})
            setStep(step - 1)
          }}
        >
          Back
        </Button>
        {step < STEPS.length - 1 && (
          <Button onClick={goNext} disabled={nextDisabled}>
            {validatingImages ? 'Validating…' : 'Next'}
          </Button>
        )}
      </div>
      </div>
    </div>
  )
}
