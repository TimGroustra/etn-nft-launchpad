import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
  clampRoyaltyBurnPercent,
  clampMintBurnPercent,
  formatMintModeLabel,
  estimateSellerRemainderPercent,
  getCompleteTokens,
  getTokenAttributesForSave,
  inferDraftResumeStep,
  isTokenRowComplete,
  isTokenRowEmpty,
  issuesToFieldMap,
  MIN_PUBLIC_MINT_ETN,
  MIN_MINT_BURN_PERCENT,
  MIN_ROYALTY_BURN_PERCENT,
  royaltyBurnBpsFromPercent,
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
import { buildEditableTokenRows, buildDraftRowsFromDb, getRowTokenId, resolveBulkImportMaxSupply } from '@/lib/draft-token-rows'
import { collectionToForm, saveDraftCollection } from '@/lib/save-draft-collection'
import { IMAGE_RULES, validateImageFileAsync } from '@/lib/validate-upload-image'
import { MetadataGuidancePanel } from '@/components/MetadataGuidancePanel'
import { MintPriceFields } from '@/components/MintPriceFields'
import { BulkTokenUpload } from '@/components/BulkTokenUpload'
import { DraftTokenRow } from '@/components/DraftTokenRow'
import { FieldError, FieldHint } from '@/components/form-fields'
import { NftPreviewCarousel, type NftPreviewItem } from '@/components/NftPreviewCarousel'
import { RoyaltyInfoPanel } from '@/components/RoyaltyInfoPanel'
import { OperationLockOverlay } from '@/components/OperationLockOverlay'
import { ScrollToEndFab } from '@/components/ScrollToEndFab'
import { useNavigationGuard } from '@/hooks/useNavigationGuard'
import { saveDraftProgress } from '@/lib/operation-progress'
import { getPublicImageUrl } from '@/lib/supabase'
import { useLaunchpadV2 } from '@/hooks/useLaunchpadV2'
import {
  resolveContractVersionForCreate,
  resolveTokenStandardForCreate,
} from '@/lib/launchpad-v2'
import { buildDraftMetadataPreview } from '@/lib/nft-metadata'
import { cn } from '@/lib/utils'
const STEPS = ['Details', 'Minting', 'Royalties & burns', 'Artwork', 'Preview', 'Save']

function PreviewSettingRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-0.5 border-b border-slate-800 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,42%)_1fr] sm:items-start sm:gap-4 sm:py-2">
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase sm:text-sm sm:font-normal sm:normal-case sm:tracking-normal sm:text-slate-400">
        {label}
      </dt>
      <dd className="text-sm text-white sm:text-right">{value}</dd>
    </div>
  )
}

function CreateHero() {
  return (
    <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 sm:p-10">
      <h1 className="text-2xl font-bold sm:text-4xl">Launch editable NFT collections on Electroneum</h1>
      <p className="mt-3 max-w-2xl text-slate-400">
        Upload artwork, configure CLUB burns, and pay ETN to publish your collection on Electroneum.
        We host images and generate metadata JSON with public URLs — you only upload image files, not links.
      </p>
    </section>
  )
}

function OptionCard({
  selected,
  title,
  description,
  onClick,
  disabled = false,
}: {
  selected: boolean
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border p-4 text-left transition-colors ${
        disabled
          ? 'cursor-not-allowed border-slate-800 bg-slate-900/30 opacity-60'
          : selected
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
  tokenStandard: 'erc721',
  mintMode: 'lazy',
  maxSupply: 100,
  mintBurnPercent: '5',
  burnOnMint: true,
  royaltyBurnPercent: '10',
  royaltyPercent: '5',
  mintPriceEtn: String(MIN_PUBLIC_MINT_ETN),
  maxMintPerWallet: '0',
  enablePublicMint: false,
  randomPublicMint: false,
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
  const [saveLock, setSaveLock] = useState<{ active: boolean; step: string; progress: number | null }>({
    active: false,
    step: '',
    progress: null,
  })
  const isSaving = saveLock.active
  useNavigationGuard(
    isSaving,
    'Your draft is still uploading. Leaving now may leave it incomplete.',
  )
  const { canUseLaunchpadV2, platformConfig } = useLaunchpadV2()
  const showEditionSizes = canUseLaunchpadV2 && form.tokenStandard === 'erc1155'

  useEffect(() => {
    if (!canUseLaunchpadV2 && form.tokenStandard !== 'erc721') {
      setForm((prev) => ({ ...prev, tokenStandard: 'erc721' }))
    }
  }, [canUseLaunchpadV2, form.tokenStandard])

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
  const publicMintAllowed = canEnablePublicMint(form)

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
          royaltyBps: percentToBps(Number(form.royaltyPercent)),
          feeRecipientPreview: '(your collection contract at publish)',
        }),
      })
    })

    setPreviewItems(preview)
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [tokens, form.royaltyPercent])

  const currentStepIssues = useMemo(
    () => validateCreateStep(step, form, tokens),
    [step, form, tokens],
  )

  const update = <K extends keyof CreateCollectionForm>(key: K, value: CreateCollectionForm[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'enablePublicMint' && value === false) {
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

    setLoading(true)
    const { step: validateStep, progress: validateProgress } = saveDraftProgress(0, 0, 'validating')
    setSaveLock({ active: true, step: validateStep, progress: validateProgress })

    try {
      for (let i = 0; i < tokens.length; i++) {
        const file = tokens[i].file
        if (!file) continue
        const imageError = await validateImageFileAsync(file)
        if (imageError) {
          toast.error(`Token #${getRowTokenId(tokens[i], i)}: ${imageError}`)
          setLoading(false)
          setSaveLock({ active: false, step: '', progress: null })
          return
        }
      }

      if (isEditingDraft && collectionId) {
        const activeCount = tokens.filter((token) => !isTokenRowEmpty(token)).length
        setSaveLock(saveDraftProgress(0, activeCount, 'uploading'))
        await saveDraftCollection(
          address,
          collectionId,
          form,
          tokens,
          existingDbTokens,
          existingCollection ?? undefined,
          (completed, total) => {
            setSaveLock(saveDraftProgress(completed, total, 'uploading'))
          },
        )
        setSaveLock(saveDraftProgress(0, 0, 'finishing'))
        toast.success('Draft updated')
      } else {
        const { step: createStep, progress: createProgress } = saveDraftProgress(0, 0, 'creating')
        setSaveLock({ active: true, step: createStep, progress: createProgress })

        const sanitized = sanitizeFormForMode(form, tokens)
        const collection = await createCollection(address, {
          name: sanitized.name.trim(),
          symbol: sanitized.symbol.trim().toUpperCase(),
          description: sanitized.description,
          mintMode: sanitized.mintMode,
          maxSupply: sanitized.maxSupply,
          mintBurnBps: percentToBps(Number(sanitized.mintBurnPercent)),
          burnOnMint: sanitized.burnOnMint,
          royaltyBurnBps: royaltyBurnBpsFromPercent(sanitized.royaltyBurnPercent),
          royaltyBps: percentToBps(Number(sanitized.royaltyPercent)),
          mintPriceEtn: sanitized.enablePublicMint ? Number(sanitized.mintPriceEtn) : 0,
          maxMintPerWallet: Number(sanitized.maxMintPerWallet) || 0,
          showOnMintPanel: sanitized.enablePublicMint && sanitized.showOnMintPanel,
          randomPublicMint: sanitized.enablePublicMint && sanitized.randomPublicMint,
          tokenStandard: resolveTokenStandardForCreate(address, platformConfig, sanitized.tokenStandard),
          contractVersion: resolveContractVersionForCreate(address, platformConfig, 2),
          chainId: getChainId(network),
        })
        setCollectionId(collection.id)
        const activeCount = tokens.filter((token) => !isTokenRowEmpty(token)).length
        setSaveLock(saveDraftProgress(0, activeCount, 'uploading'))
        await saveDraftCollection(
          address,
          collection.id,
          form,
          tokens,
          [],
          undefined,
          (completed, total) => {
            setSaveLock(saveDraftProgress(completed, total, 'uploading'))
          },
        )
        setSaveLock(saveDraftProgress(0, 0, 'finishing'))
        toast.success('Draft saved')
      }
      navigate('/dashboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save draft')
    } finally {
      setLoading(false)
      setSaveLock({ active: false, step: '', progress: null })
    }
  }

  const addTokenRow = () => {
    const nextId = getRowTokenId(tokens[tokens.length - 1] ?? { tokenId: 0 } as DraftToken, tokens.length - 1) + 1
    const next = [
      ...tokens,
      { tokenId: nextId, name: `Token #${nextId}`, description: '', file: null, attributes: [] },
    ]
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
    const nextMaxSupply = resolveBulkImportMaxSupply(imported)
    if (nextMaxSupply === 0) return

    const rows = buildEditableTokenRows(imported, nextMaxSupply)
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

    if (nextMaxSupply !== form.maxSupply) {
      toast.message(`Max supply adjusted to ${nextMaxSupply} to match your bulk upload.`)
    }

    const nextForm = sanitizeFormForMode({ ...form, maxSupply: nextMaxSupply }, merged)
    setForm(nextForm)
    setTokensAndSync(merged)
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
  const resaleRoyaltyPercent = Number(formatPercentDisplay(form.royaltyPercent)) || 0
  const sellerRemainderPercent = estimateSellerRemainderPercent(resaleRoyaltyPercent)
  const nextDisabled = validatingImages || currentStepIssues.length > 0

  return (
    <div className="space-y-8">
      {!isEditingDraft && <CreateHero />}
      <div className={cn('mx-auto space-y-6', step === 4 ? 'max-w-3xl' : 'max-w-2xl')}>
      <div>
        <h2 className="text-3xl font-bold">{isEditingDraft ? 'Edit Draft Collection' : 'Create Collection'}</h2>
        <p className="text-slate-400">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
        <p className="text-sm text-slate-500">Creating on {chain.name}</p>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs whitespace-nowrap',
              i <= step ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400',
            )}
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
          {canUseLaunchpadV2 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm font-medium text-amber-200">Admin preview: Launchpad V2</p>
              <FieldHint>
                ERC-721 V2 (full ERC-4906) and ERC-1155 editions are only available to admin wallets while
                preview is enabled. Everyone else still deploys legacy ERC-721 via the original factory.
              </FieldHint>
            </div>
          )}
          {canUseLaunchpadV2 && (
          <div>
            <Label>Token standard</Label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <OptionCard
                selected={form.tokenStandard === 'erc721'}
                title="ERC-721"
                description="One unique NFT per token id. Full ERC-4906 marketplace metadata sync on new contracts."
                onClick={() => update('tokenStandard', 'erc721')}
                disabled={isEditingDraft}
              />
              <OptionCard
                selected={form.tokenStandard === 'erc1155'}
                title="ERC-1155"
                description="Editioned copies per artwork (semi-fungible). Best for multiple owners of the same design."
                onClick={() => update('tokenStandard', 'erc1155')}
                disabled={isEditingDraft}
              />
            </div>
            {isEditingDraft && (
              <FieldHint>Token standard is fixed after the draft is created.</FieldHint>
            )}
          </div>
          )}
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
                title="Public minting"
                description="Upload artwork, then mint yourself or enable a paid public sale for collectors."
                onClick={() => setMintMode('lazy')}
              />
              <OptionCard
                selected={form.mintMode === 'batch'}
                title="Batch mint at publish"
                description="Upload every token upfront. The full collection is minted to your wallet when you publish — no public sale."
                onClick={() => setMintMode('batch')}
              />
            </div>
          </div>

          {!isBatch && (
            <>
              <ToggleRow
                checked={form.enablePublicMint}
                disabled={!publicMintAllowed}
                onChange={(enablePublicMint) => update('enablePublicMint', enablePublicMint)}
                label="Enable paid public sale (IMintable)"
                description="Lets collectors mint via any marketplace that supports IMintable (e.g. ElectroSwap). Requires at least 1 ETN and complete metadata for every token."
              />

              {form.enablePublicMint && (
                <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <MintPriceFields
                    etnValue={form.mintPriceEtn}
                    onEtnChange={(mintPriceEtn) => update('mintPriceEtn', mintPriceEtn)}
                    minEtn={MIN_PUBLIC_MINT_ETN}
                    etnError={fieldErrors.mintPriceEtn}
                  />
                  <div>
                    <Label>Max mints per wallet</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.maxMintPerWallet}
                      onChange={(e) => update('maxMintPerWallet', e.target.value)}
                    />
                    <FieldHint>Limit how many NFTs one wallet can mint via paid sale. Use 0 for no limit.</FieldHint>
                    <FieldError message={fieldErrors.maxMintPerWallet} />
                  </div>
                  <ToggleRow
                    checked={form.randomPublicMint}
                    onChange={(randomPublicMint) => update('randomPublicMint', randomPublicMint)}
                    label="Random mint order"
                    description="Assigns metadata randomly at mint time so snipers cannot predict the next reveal from mint order."
                  />
                </div>
              )}

              <ToggleRow
                checked={form.showOnMintPanel}
                disabled={!form.enablePublicMint}
                disabledReason="Enable paid public sale (IMintable) before listing on the home page minting panel."
                onChange={(showOnMintPanel) => update('showOnMintPanel', showOnMintPanel)}
                label="Show on NFT Minting Panel"
                description="List this collection on the launchpad home page so anyone can mint directly from their wallet."
              />

              {form.enablePublicMint && (
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-100">
                  Paid public sale requires artwork and metadata for all {form.maxSupply} tokens before you can save or
                  publish.
                </div>
              )}
            </>
          )}

          {isBatch && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              Batch mint requires artwork and metadata for all {form.maxSupply} tokens. Everything is minted to your
              wallet at publish — paid public sale is not available in this mode.
            </div>
          )}

          <FieldError message={fieldErrors.enablePublicMint || fieldErrors.showOnMintPanel || fieldErrors.tokens || stepError} />
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4">
          <div>
            <CardTitle>Royalties &amp; CLUB burns</CardTitle>
            <CardDescription className="mt-2 leading-relaxed">
              {isBatch ? (
                <>
                  When someone <strong className="text-slate-300">resells</strong> your NFT, your contract can earn a
                  royalty and optionally burn part of it as CLUB. Batch collections mint everything to you at publish —
                  there is no paid public mint step.
                </>
              ) : (
                <>
                  There are two separate moments: when someone <strong className="text-slate-300">resells</strong> your
                  NFT, and when someone <strong className="text-slate-300">buys a new mint</strong>. Resale royalty can
                  be set high (e.g. 96%) — just leave room for the marketplace&apos;s own fee (~3% on ElectroSwap).
                </>
              )}
            </CardDescription>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm leading-relaxed text-slate-300">
            <p className="font-medium text-white">Quick guide</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-slate-400">
              <li>
                <span className="text-slate-300">Resale royalty</span> — your cut when the NFT is sold again (0–100%).
                Add the marketplace fee on top — 96% royalty + 3% fee leaves 1% for the seller.
              </li>
              <li>
                <span className="text-slate-300">Burn from resales</span> — how much of that resale income goes to CLUB
                burns ({MIN_ROYALTY_BURN_PERCENT}–100% minimum). Set 100% if you want it all burned.
              </li>
              {!isBatch && (
                <li>
                  <span className="text-slate-300">Burn on new mints</span> — required ({MIN_MINT_BURN_PERCENT}%
                  minimum) when collectors pay to mint via IMintable.
                </li>
              )}
            </ul>
          </div>

          <div>
            <Label>Resale royalty (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.royaltyPercent}
              onChange={(e) => update('royaltyPercent', sanitizePercentInput(e.target.value))}
              onBlur={() => update('royaltyPercent', formatPercentDisplay(form.royaltyPercent))}
            />
            <FieldHint>
              Your EIP-2981 share of each resale. The marketplace also takes its own fee (ElectroSwap is ~3%). Royalty
              + marketplace fee must stay at or below 100% or the seller receives little or nothing.
            </FieldHint>
            {resaleRoyaltyPercent >= 100 && (
              <p className="mt-2 text-sm text-amber-300">
                100% royalty plus a ~3% marketplace fee exceeds the sale price — this caused the 103% fee issue. Try 96%
                instead so the seller still receives ~1%.
              </p>
            )}
            {resaleRoyaltyPercent > 0 && resaleRoyaltyPercent < 100 && (
              <p className="mt-2 text-sm text-slate-500">
                At {formatPercentDisplay(form.royaltyPercent)}% royalty + ~3% marketplace fee, the seller keeps about{' '}
                {sellerRemainderPercent}% of the sale (e.g. {sellerRemainderPercent}% of 5,000 ETN ={' '}
                {(5000 * sellerRemainderPercent) / 100} ETN).
              </p>
            )}
            <FieldError message={fieldErrors.royaltyPercent} />
          </div>

          <div>
            <Label>Burn from resales (%)</Label>
            <Input
              type="number"
              min={MIN_ROYALTY_BURN_PERCENT}
              max={100}
              step="0.01"
              value={form.royaltyBurnPercent}
              onChange={(e) => update('royaltyBurnPercent', sanitizePercentInput(e.target.value))}
              onBlur={() => update('royaltyBurnPercent', clampRoyaltyBurnPercent(form.royaltyBurnPercent))}
            />
            <FieldHint>
              Of the ETN your contract receives from resales, this share is swapped to CLUB and burned (
              {MIN_ROYALTY_BURN_PERCENT}–100% required). Want everything burned? Set this to 100% — e.g. 96% leaves 4%
              for you to withdraw.
            </FieldHint>
            <FieldError message={fieldErrors.royaltyBurnPercent} />
          </div>

          {!isBatch && (
            <div>
              <Label>Burn from each mint (% of mint price)</Label>
              <Input
                type="number"
                min={MIN_MINT_BURN_PERCENT}
                max={100}
                step="0.01"
                value={form.mintBurnPercent}
                onChange={(e) => update('mintBurnPercent', sanitizePercentInput(e.target.value))}
                onBlur={() => update('mintBurnPercent', clampMintBurnPercent(form.mintBurnPercent))}
              />
              <FieldHint>
                Required for public minting collections ({MIN_MINT_BURN_PERCENT}–100%). A share of each paid mint is
                swapped to CLUB and burned — separate from resale royalties above.
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
                {form.enablePublicMint || isBatch
                  ? ` All ${form.maxSupply} rows must be complete (name + image).`
                  : ' At least one complete row is required for public minting.'}
              </FieldHint>
            </div>

            {(form.enablePublicMint || isBatch) && tokens.length < form.maxSupply && (
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
                showEditionSize={showEditionSizes}
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
          <div id="artwork-step-end" className="h-px" aria-hidden />
          <ScrollToEndFab itemCount={tokens.length} targetId="artwork-step-end" />
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4 sm:space-y-6">
          <Card className="space-y-4 p-4 sm:p-6">
            <div>
              <CardTitle>Preview your NFTs</CardTitle>
              <FieldHint>
                <span className="sm:hidden">Swipe each image to check artwork and metadata before saving.</span>
                <span className="hidden sm:inline">
                  Click through each token to verify the artwork and metadata JSON before saving. Royalty fields are
                  included automatically — <code className="text-slate-400">fee_recipient</code> becomes your collection
                  contract at publish.
                </span>
              </FieldHint>
            </div>
            <NftPreviewCarousel tokens={previewItems} collectionName={form.name.trim() || 'Collection'} />
          </Card>

          <RoyaltyInfoPanel
            compact
            creatorWallet={address}
            royaltyPercent={form.royaltyPercent}
            royaltyBurnPercent={form.royaltyBurnPercent}
          />

          <Card className="space-y-3 p-4 sm:p-6">
            <CardTitle>Collection settings</CardTitle>
            <CardDescription className="line-clamp-3">{form.description || 'No description'}</CardDescription>
            <dl className="mt-2">
              <PreviewSettingRow label="Collection" value={`${form.name} (${form.symbol})`} />
              <PreviewSettingRow label="Mint mode" value={formatMintModeLabel(form.mintMode)} />
              <PreviewSettingRow label="Max supply" value={form.maxSupply} />
              <PreviewSettingRow
                label="Paid public sale"
                value={
                  isBatch
                    ? 'Not available (batch mint to your wallet)'
                    : form.enablePublicMint
                      ? `${form.mintPriceEtn} ETN${Number(form.maxMintPerWallet) > 0 ? ` · max ${form.maxMintPerWallet}/wallet` : ''}${form.randomPublicMint ? ' · random order' : ''}`
                      : 'Disabled'
                }
              />
              {!isBatch && (
                <PreviewSettingRow
                  label="Minting panel"
                  value={form.enablePublicMint && form.showOnMintPanel ? 'Visible on home page' : 'Hidden'}
                />
              )}
              <PreviewSettingRow
                label="Resale royalty"
                value={`${formatPercentDisplay(form.royaltyPercent)}% on resales`}
              />
              <PreviewSettingRow
                label="Burn from resales"
                value={`${formatPercentDisplay(form.royaltyBurnPercent)}% of resale income`}
              />
              <PreviewSettingRow
                label="Burn on new mints"
                value={
                  isBatch
                    ? 'Not available in batch mode'
                    : `${formatPercentDisplay(form.mintBurnPercent)}% of mint price → CLUB (min ${MIN_MINT_BURN_PERCENT}%)`
                }
              />
              <PreviewSettingRow
                label="Artwork"
                value={
                  <>
                    {completeCount} complete / {form.maxSupply} required
                    {form.enablePublicMint ? ' for paid public sale' : isBatch ? ' for batch mint' : ''}
                  </>
                }
              />
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
              : 'Save your collection, then publish from the dashboard. We deploy the contract, upload metadata, and configure paid public sale (IMintable) when enabled.'}
          </CardDescription>
          <p className="mt-3 text-sm leading-relaxed text-amber-200/90">
            Saving uploads every image and metadata file. Large collections can take several minutes — keep this tab
            open until the progress bar finishes. On mobile, stay in the browser while MetaMask asks you to sign;
            switching apps can disconnect your wallet mid-save.
          </p>
          <Button className="mt-4" onClick={saveDraft} disabled={loading || validatingImages || isSaving}>
            {isSaving || loading ? 'Saving…' : validatingImages ? 'Validating images…' : isEditingDraft ? 'Save changes' : 'Save draft'}
          </Button>
          {isEditingDraft && !isSaving && (
            <Button variant="outline" className="mt-3 ml-3" asChild>
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          )}
          {isEditingDraft && !isSaving && (
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
          disabled={step === 0 || isSaving}
          onClick={() => {
            setStepError(null)
            setFieldErrors({})
            setStep(step - 1)
          }}
        >
          Back
        </Button>
        {step < STEPS.length - 1 && (
          <Button onClick={goNext} disabled={nextDisabled || isSaving}>
            {validatingImages ? 'Validating…' : 'Next'}
          </Button>
        )}
      </div>

      <OperationLockOverlay
        open={isSaving}
        title={isEditingDraft ? 'Saving draft changes' : 'Saving your draft'}
        description="We are uploading your collection images and metadata. This is normal for large collections and can take several minutes."
        currentStep={saveLock.step}
        progress={saveLock.progress}
      />
      </div>
    </div>
  )
}
