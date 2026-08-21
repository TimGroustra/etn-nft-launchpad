import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input, Label, Textarea } from '@/components/ui/input'
import { WalletAuthButton, useWalletAuth } from '@/hooks/useWalletAuth'
import { createCollection, addToken, uploadImage } from '@/lib/api'
import { useNetwork } from '@/context/NetworkContext'
import { getChainId } from '@/lib/blockchain'
import {
  canEnablePublicMint,
  getCompleteTokens,
  issuesToFieldMap,
  MIN_PUBLIC_MINT_ETN,
  sanitizeFormForMode,
  validateBeforeSave,
  validateCreateStep,
  firstIssueMessage,
  type CreateCollectionForm,
  type DraftToken,
  type MintMode,
} from '@/lib/create-collection-validation'
import { IMAGE_RULES, validateImageFileAsync } from '@/lib/validate-upload-image'
import { MetadataGuidancePanel } from '@/components/MetadataGuidancePanel'
import { NftPreviewCarousel, type NftPreviewItem } from '@/components/NftPreviewCarousel'
import { RoyaltyInfoPanel } from '@/components/RoyaltyInfoPanel'
import { buildDraftMetadataPreview } from '@/lib/nft-metadata'

const STEPS = ['Details', 'Minting', 'Burns', 'Artwork', 'Preview', 'Save']

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{children}</p>
}

function FieldError({ message }: { message: string | null | undefined }) {
  if (!message) return null
  return <p className="mt-1.5 text-sm text-red-400">{message}</p>
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
  clubBurnAmount: '0',
  burnOnMint: false,
  royaltyBurnPercent: '0',
  mintPriceEtn: String(MIN_PUBLIC_MINT_ETN),
  maxMintPerWallet: '0',
  enablePublicMint: false,
}

export function CreatePage() {
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const { isAuthenticated } = useWalletAuth()
  const { network, chain } = useNetwork()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [validatingImages, setValidatingImages] = useState(false)
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [stepError, setStepError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<CreateCollectionForm>(INITIAL_FORM)
  const [tokens, setTokens] = useState<DraftToken[]>([{ name: 'Token #1', description: '', file: null }])
  const [previewItems, setPreviewItems] = useState<NftPreviewItem[]>([])

  const completeCount = getCompleteTokens(tokens).length
  const publicMintAllowed = canEnablePublicMint(form, tokens)

  useEffect(() => {
    const complete = getCompleteTokens(tokens)
    const objectUrls = complete.map((token) => (token.file ? URL.createObjectURL(token.file) : null))
    setPreviewItems(
      complete.map((token, i) => ({
        tokenId: i + 1,
        name: token.name.trim(),
        description: token.description,
        imageUrl: objectUrls[i],
        metadata: buildDraftMetadataPreview({
          name: token.name,
          description: token.description,
        }),
      })),
    )
    return () => {
      objectUrls.forEach((url) => {
        if (url) URL.revokeObjectURL(url)
      })
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
            setFieldErrors({ [`token.${i + 1}.image`]: imageError })
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
          toast.error(`Token #${i + 1}: ${imageError}`)
          return
        }
      }
    } finally {
      setValidatingImages(false)
    }

    const sanitized = sanitizeFormForMode(form, tokens)
    setLoading(true)
    try {
      const collection = await createCollection(address, {
        name: sanitized.name.trim(),
        symbol: sanitized.symbol.trim().toUpperCase(),
        description: sanitized.description,
        mintMode: sanitized.mintMode,
        maxSupply: sanitized.maxSupply,
        clubBurnAmount: Number(sanitized.clubBurnAmount),
        burnOnMint: sanitized.burnOnMint,
        royaltyBurnBps: Math.min(10000, Math.max(0, Math.round(Number(sanitized.royaltyBurnPercent) * 100))),
        mintPriceEtn: sanitized.enablePublicMint ? Number(sanitized.mintPriceEtn) : 0,
        maxMintPerWallet: Number(sanitized.maxMintPerWallet) || 0,
        chainId: getChainId(network),
      })
      setCollectionId(collection.id)

      const tokensToSave = getCompleteTokens(tokens)
      for (let i = 0; i < tokensToSave.length; i++) {
        const token = tokensToSave[i]
        const imagePath = token.file ? await uploadImage(collection.id, i + 1, token.file) : undefined
        await addToken(address, {
          collectionId: collection.id,
          tokenId: i + 1,
          name: token.name.trim(),
          description: token.description.trim(),
          imageStoragePath: imagePath,
          attributes: [],
        })
      }

      toast.success('Draft saved')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save draft')
    } finally {
      setLoading(false)
    }
  }

  const addTokenRow = () => {
    const next = [...tokens, { name: `Token #${tokens.length + 1}`, description: '', file: null }]
    if (form.mintMode === 'batch' && !form.enablePublicMint) {
      setForm((prev) => sanitizeFormForMode({ ...prev, maxSupply: next.length }, next))
    }
    setTokensAndSync(next)
  }

  const fillRowsToMaxSupply = () => {
    if (tokens.length >= form.maxSupply) return
    const extra = Array.from({ length: form.maxSupply - tokens.length }, (_, j) => ({
      name: `Token #${tokens.length + j + 1}`,
      description: '',
      file: null,
    }))
    setTokensAndSync([...tokens, ...extra])
  }

  if (!isConnected) {
    return (
      <Card>
        <CardTitle>Connect your wallet</CardTitle>
        <CardDescription className="mt-2">Connect an Electroneum wallet to create a collection.</CardDescription>
      </Card>
    )
  }

  if (!isAuthenticated) {
    return (
      <Card>
        <CardTitle>Sign in with wallet</CardTitle>
        <CardDescription className="mt-2">Authenticate to create and manage collections.</CardDescription>
        <div className="mt-4">
          <WalletAuthButton />
        </div>
      </Card>
    )
  }

  const isBatch = form.mintMode === 'batch'
  const nextDisabled = validatingImages || currentStepIssues.length > 0

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create Collection</h1>
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
            label="Enable ElectroSwap public mint"
            description="Lets anyone mint directly on ElectroSwap. Requires a minimum price of 1 ETN and complete metadata for every token in max supply."
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
                <FieldHint>Minimum {MIN_PUBLIC_MINT_ETN} ETN per NFT on ElectroSwap.</FieldHint>
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
                <FieldHint>Limit how many NFTs one wallet can mint on ElectroSwap. Use 0 for no limit.</FieldHint>
                <FieldError message={fieldErrors.maxMintPerWallet} />
              </div>
            </div>
          )}

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
              plus any unsold supply share the same ElectroSwap price.
            </div>
          )}

          <FieldError message={fieldErrors.enablePublicMint || fieldErrors.tokens || stepError} />
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
              onChange={(e) => update('royaltyBurnPercent', e.target.value)}
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
            disabledReason="Mint CLUB burn only applies when ElectroSwap public mint is enabled."
            onChange={(burnOnMint) => update('burnOnMint', burnOnMint)}
            label="Burn CLUB on ElectroSwap mint"
            description="When someone mints via ElectroSwap, part of their ETN payment is swapped to CLUB and sent to the burn address."
          />

          {form.burnOnMint && (
            <div>
              <Label>CLUB burned per public mint</Label>
              <Input
                type="number"
                min={0}
                step="0.000001"
                value={form.clubBurnAmount}
                onChange={(e) => update('clubBurnAmount', e.target.value)}
              />
              <FieldHint>Exact amount of CLUB tokens burned each time a collector mints on ElectroSwap.</FieldHint>
              <FieldError message={fieldErrors.clubBurnAmount} />
            </div>
          )}

          <FieldError message={fieldErrors.burnOnMint || stepError} />
        </Card>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <MetadataGuidancePanel />
          <Card className="space-y-4">
          <div>
            <CardTitle>{isBatch ? 'Upload your full collection' : 'Upload artwork'}</CardTitle>
            <FieldHint>
              Images: PNG, JPEG, WebP, or GIF · {IMAGE_RULES.minWidth}×{IMAGE_RULES.minHeight}px minimum · 10 MB max.
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
            <div key={i} className="space-y-3 rounded-lg border border-slate-800 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Token #{i + 1}</p>
              <Input
                value={token.name}
                onChange={(e) => {
                  const next = [...tokens]
                  next[i] = { ...next[i], name: e.target.value }
                  setTokensAndSync(next)
                }}
                placeholder="Token name"
              />
              <FieldError message={fieldErrors[`token.${i + 1}.name`]} />
              <Textarea
                value={token.description}
                onChange={(e) => {
                  const next = [...tokens]
                  next[i] = { ...next[i], description: e.target.value }
                  setTokensAndSync(next)
                }}
                placeholder="Description (optional)"
              />
              <FieldError message={fieldErrors[`token.${i + 1}.description`]} />
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  const next = [...tokens]
                  next[i] = { ...next[i], file }
                  setTokensAndSync(next)
                }}
              />
              <FieldError message={fieldErrors[`token.${i + 1}.image`]} />
            </div>
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
                <dt className="text-slate-400">Royalties burn</dt>
                <dd>{form.royaltyBurnPercent || '0'}% of contract royalties</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-800 py-2">
                <dt className="text-slate-400">Mint CLUB burn</dt>
                <dd>{form.burnOnMint ? `${form.clubBurnAmount} CLUB` : 'Off'}</dd>
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
          <CardTitle>Save draft</CardTitle>
          <CardDescription className="mt-2">
            Save your collection, then publish from the dashboard. We deploy the contract, upload metadata, and
            configure ElectroSwap for you.
          </CardDescription>
          <Button className="mt-4" onClick={saveDraft} disabled={loading || validatingImages}>
            {loading ? 'Saving…' : validatingImages ? 'Validating images…' : 'Save draft'}
          </Button>
          {collectionId && <p className="mt-2 text-sm text-green-400">Draft saved. Go to dashboard to publish.</p>}
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
  )
}
