import { validateImageFileSync } from '@/lib/validate-upload-image'
import { validateAttributesList } from '@/lib/metadata-import'
import { getRowTokenId } from '@/lib/draft-token-rows'
import type { NftAttribute } from '@/lib/nft-metadata'

export type MintMode = 'lazy' | 'batch'

export type CreateCollectionForm = {
  name: string
  symbol: string
  description: string
  mintMode: MintMode
  maxSupply: number
  mintBurnPercent: string
  burnOnMint: boolean
  royaltyBurnPercent: string
  mintPriceEtn: string
  maxMintPerWallet: string
  enablePublicMint: boolean
  showOnMintPanel: boolean
}

export type DraftToken = {
  tokenId?: number
  dbTokenId?: string
  name: string
  description: string
  file: File | null
  existingImagePath?: string | null
  attributes: NftAttribute[]
}

export type ValidationIssue = {
  field: string
  message: string
}

export const MIN_PUBLIC_MINT_ETN = 1
export const MAX_SUPPLY = 100_000
export const TOKEN_NAME_MAX = 80
export const TOKEN_DESC_MAX = 2000
export const COLLECTION_NAME_MAX = 80
export const COLLECTION_DESC_MAX = 2000

const SYMBOL_RE = /^[A-Z0-9]{2,12}$/

export function percentToBps(percent: number): number {
  return Math.min(10_000, Math.max(0, Math.round(percent * 100)))
}

export function bpsToPercent(bps: number): number {
  return bps / 100
}

export function formatPercentFromBps(bps: number): string {
  return `${bpsToPercent(bps).toFixed(2).replace(/\.?0+$/, '')}%`
}

/** Sanitize percentage text while typing — strips invalid chars, leading zeros, caps at 100. */
export function sanitizePercentInput(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') return ''

  let value = trimmed.replace(/[^\d.]/g, '')
  const firstDot = value.indexOf('.')
  if (firstDot !== -1) {
    value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, '')
  }

  const hasDot = firstDot !== -1
  let [whole = '', frac = ''] = value.split('.')
  if (hasDot) frac = frac.slice(0, 2)

  if (whole.length > 1 && whole.startsWith('0')) {
    whole = whole.replace(/^0+/, '') || '0'
  }

  if (!hasDot) {
    value = whole
  } else if (raw.endsWith('.') && frac === '') {
    value = `${whole || '0'}.`
  } else {
    value = frac === '' && !raw.endsWith('.') ? whole || '0' : `${whole || '0'}.${frac}`
  }

  if (value === '' || value === '.') return ''

  const num = Number(value.endsWith('.') ? value.slice(0, -1) : value)
  if (!Number.isFinite(num)) return ''
  if (num > 100) return '100'

  return value
}

/** Normalize a percent string for display/storage (e.g. "050" → "50", "" → "0"). */
export function formatPercentDisplay(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '.') return '0'
  const num = Number(trimmed)
  if (!Number.isFinite(num)) return '0'
  const clamped = Math.min(100, Math.max(0, num))
  if (Number.isInteger(clamped)) return String(clamped)
  return String(clamped).replace(/0+$/, '').replace(/\.$/, '')
}

export function isTokenRowComplete(token: DraftToken): boolean {
  return Boolean(token.name.trim() && (token.file || token.existingImagePath))
}

export function isTokenRowEmpty(token: DraftToken): boolean {
  return !token.name.trim() && !token.description.trim() && !token.file && token.attributes.length === 0
}

export function getCompleteTokens(tokens: DraftToken[]): DraftToken[] {
  return tokens.filter(isTokenRowComplete)
}

export function getTokenAttributesForSave(token: DraftToken): NftAttribute[] {
  return token.attributes.filter(
    (attr) => attr.trait_type.trim() && String(attr.value).trim() !== '',
  )
}

export function getActiveTokens(tokens: DraftToken[]): DraftToken[] {
  return tokens.filter((t) => !isTokenRowEmpty(t))
}

/** Tokens that are partially filled — always invalid */
export function getPartialTokens(tokens: DraftToken[]): DraftToken[] {
  return tokens.filter((t) => !isTokenRowEmpty(t) && !isTokenRowComplete(t))
}

export function countPublicMintSlots(form: CreateCollectionForm, tokens: DraftToken[]): number {
  const complete = getCompleteTokens(tokens).length
  return Math.max(0, form.maxSupply - complete)
}

export function canEnablePublicMint(form: CreateCollectionForm, tokens: DraftToken[]): boolean {
  if (form.mintMode === 'batch') {
    return getCompleteTokens(tokens).length < form.maxSupply
  }
  return true
}

export function sanitizeFormForMode(form: CreateCollectionForm, tokens: DraftToken[]): CreateCollectionForm {
  const next = { ...form }
  const completeCount = getCompleteTokens(tokens).length

  if (next.burnOnMint && !next.enablePublicMint) {
    next.burnOnMint = false
    next.mintBurnPercent = '0'
  }

  if (next.mintMode === 'batch' && !canEnablePublicMint(next, tokens)) {
    next.enablePublicMint = false
  }

  if (next.mintMode === 'batch' && !next.enablePublicMint && completeCount > 0) {
    next.maxSupply = completeCount
  }

  if (!next.enablePublicMint) {
    next.burnOnMint = false
    next.mintBurnPercent = '0'
    next.showOnMintPanel = false
  }

  return next
}

function validateTokenMetadata(tokens: DraftToken[], prefix: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const names = new Set<string>()

  tokens.forEach((token, index) => {
    const rowNum = getRowTokenId(token, index)
    const row = `${prefix}${rowNum}`
    if (isTokenRowEmpty(token)) return

    const name = token.name.trim()
    if (!name) {
      issues.push({ field: `${row}.name`, message: 'Token name is required.' })
    } else if (name.length > TOKEN_NAME_MAX) {
      issues.push({ field: `${row}.name`, message: `Token name must be ${TOKEN_NAME_MAX} characters or fewer.` })
    } else if (names.has(name.toLowerCase())) {
      issues.push({ field: `${row}.name`, message: 'Each token name must be unique within the collection.' })
    } else {
      names.add(name.toLowerCase())
    }

    const desc = token.description.trim()
    if (desc.length > TOKEN_DESC_MAX) {
      issues.push({ field: `${row}.description`, message: `Description must be ${TOKEN_DESC_MAX} characters or fewer.` })
    }

    if (!token.file && !token.existingImagePath) {
      issues.push({ field: `${row}.image`, message: 'An image is required for this token.' })
    } else if (token.file) {
      const imageError = validateImageFileSync(token.file)
      if (imageError) issues.push({ field: `${row}.image`, message: imageError })
    }

    const filledAttributes = token.attributes.filter(
      (attr) => attr.trait_type.trim() || String(attr.value).trim(),
    )
    if (filledAttributes.some((attr) => !attr.trait_type.trim() || String(attr.value).trim() === '')) {
      issues.push({
        field: `${row}.attributes`,
        message: 'Each attribute needs both a trait name and a value, or remove empty rows.',
      })
    } else {
      const attrError = validateAttributesList(filledAttributes, `Token #${rowNum}`)
      if (attrError) issues.push({ field: `${row}.attributes`, message: attrError })
    }
  })

  return issues
}

function validateMintingRules(
  form: CreateCollectionForm,
  tokens: DraftToken[],
  requireTokens: boolean,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const completeCount = getCompleteTokens(tokens).length
  const partial = getPartialTokens(tokens)

  if (requireTokens && partial.length > 0) {
    issues.push({
      field: 'tokens',
      message: 'Finish every started token row (name + image) or remove it before continuing.',
    })
  }

  if (form.enablePublicMint) {
    const price = Number(form.mintPriceEtn)
    if (!Number.isFinite(price) || price < MIN_PUBLIC_MINT_ETN) {
      issues.push({
        field: 'mintPriceEtn',
        message: `Public mint requires a price of at least ${MIN_PUBLIC_MINT_ETN} ETN.`,
      })
    }

    const maxPerWallet = Number(form.maxMintPerWallet)
    if (!Number.isFinite(maxPerWallet) || maxPerWallet < 0 || !Number.isInteger(maxPerWallet)) {
      issues.push({ field: 'maxMintPerWallet', message: 'Max mints per wallet must be a whole number (0 = unlimited).' })
    } else if (maxPerWallet > form.maxSupply) {
      issues.push({
        field: 'maxMintPerWallet',
        message: 'Max mints per wallet cannot exceed max supply.',
      })
    }

    if (requireTokens) {
      if (form.mintMode === 'batch' && completeCount >= form.maxSupply) {
        issues.push({
          field: 'enablePublicMint',
          message: 'Public mint is unavailable when batch mint uses the entire max supply. Lower artwork count or raise max supply.',
        })
      }

      if (completeCount < form.maxSupply) {
        issues.push({
          field: 'tokens',
          message: `Public mint requires metadata for all ${form.maxSupply} tokens. Upload ${form.maxSupply - completeCount} more complete row(s), or lower max supply.`,
        })
      }
    }
  } else if (requireTokens && form.mintMode === 'batch') {
    if (completeCount !== form.maxSupply) {
      issues.push({
        field: 'maxSupply',
        message: `Batch mint without public sale requires exactly ${completeCount || 'one'} artwork row(s) matching max supply.`,
      })
    }
  }

  if (requireTokens && form.mintMode === 'lazy' && !form.enablePublicMint && completeCount < 1) {
    issues.push({
      field: 'tokens',
      message: 'Lazy mint requires at least one complete token (name + image).',
    })
  }

  if (requireTokens && form.mintMode === 'batch') {
    if (completeCount < 1) {
      issues.push({ field: 'tokens', message: 'Batch mint requires at least one complete token (name + image).' })
    }
    if (completeCount > form.maxSupply) {
      issues.push({
        field: 'tokens',
        message: `You have ${completeCount} tokens but max supply is ${form.maxSupply}. Remove extras or increase max supply.`,
      })
    }
  }

  return issues
}

export function validateCreateStep(
  step: number,
  form: CreateCollectionForm,
  tokens: DraftToken[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const f = sanitizeFormForMode(form, tokens)

  if (step === 0) {
    const name = f.name.trim()
    if (!name) issues.push({ field: 'name', message: 'Collection name is required.' })
    else if (name.length < 2) issues.push({ field: 'name', message: 'Collection name must be at least 2 characters.' })
    else if (name.length > COLLECTION_NAME_MAX) {
      issues.push({ field: 'name', message: `Collection name must be ${COLLECTION_NAME_MAX} characters or fewer.` })
    }

    const symbol = f.symbol.trim().toUpperCase()
    if (!symbol) issues.push({ field: 'symbol', message: 'Symbol is required.' })
    else if (!SYMBOL_RE.test(symbol)) {
      issues.push({ field: 'symbol', message: 'Symbol must be 2–12 letters or numbers (A–Z, 0–9).' })
    }

    if (f.description.trim().length > COLLECTION_DESC_MAX) {
      issues.push({ field: 'description', message: `Description must be ${COLLECTION_DESC_MAX} characters or fewer.` })
    }

    if (!Number.isInteger(f.maxSupply) || f.maxSupply < 1) {
      issues.push({ field: 'maxSupply', message: 'Max supply must be a whole number of at least 1.' })
    } else if (f.maxSupply > MAX_SUPPLY) {
      issues.push({ field: 'maxSupply', message: `Max supply cannot exceed ${MAX_SUPPLY.toLocaleString()}.` })
    }
  }

  if (step === 1) {
    issues.push(...validateMintingRules(f, tokens, false))

    if (f.enablePublicMint && !canEnablePublicMint(f, tokens) && f.mintMode === 'batch') {
      issues.push({
        field: 'enablePublicMint',
        message: 'Add fewer tokens than max supply before enabling public mint in batch mode.',
      })
    }

    if (f.showOnMintPanel && !f.enablePublicMint) {
      issues.push({
        field: 'showOnMintPanel',
        message: 'Enable public mint before listing on the NFT Minting Panel.',
      })
    }
  }

  if (step === 2) {
    const royalty = Number(f.royaltyBurnPercent)
    if (!Number.isFinite(royalty) || royalty < 0 || royalty > 100) {
      issues.push({ field: 'royaltyBurnPercent', message: 'Royalties burn must be between 0 and 100%.' })
    }

    if (f.burnOnMint && !f.enablePublicMint) {
      issues.push({
        field: 'burnOnMint',
        message: 'Mint CLUB burn only applies when public mint (IMintable) is enabled.',
      })
    }

    if (f.burnOnMint) {
      const mintBurn = Number(f.mintBurnPercent)
      if (!Number.isFinite(mintBurn) || mintBurn <= 0 || mintBurn > 100) {
        issues.push({
          field: 'mintBurnPercent',
          message: 'Enter a mint burn percentage between 0 and 100, or turn off mint CLUB burn.',
        })
      }
    }
  }

  if (step === 3) {
    issues.push(...validateMintingRules(f, tokens, true))
    issues.push(...validateTokenMetadata(getActiveTokens(tokens), 'token.'))
  }

  return issues
}

export function validateBeforeSave(form: CreateCollectionForm, tokens: DraftToken[]): ValidationIssue[] {
  const all: ValidationIssue[] = []
  for (let step = 0; step <= 3; step++) {
    all.push(...validateCreateStep(step, form, tokens))
  }
  return dedupeIssues(all)
}

export function inferDraftResumeStep(form: CreateCollectionForm, tokens: DraftToken[]): number {
  const sanitized = sanitizeFormForMode(form, tokens)
  for (let step = 0; step <= 3; step++) {
    if (validateCreateStep(step, sanitized, tokens).length > 0) {
      return step
    }
  }
  return validateBeforeSave(sanitized, tokens).length === 0 ? 4 : 3
}

export function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.field}:${issue.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function issuesToFieldMap(issues: ValidationIssue[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const issue of issues) {
    if (!map[issue.field]) map[issue.field] = issue.message
  }
  return map
}

export function firstIssueMessage(issues: ValidationIssue[]): string | null {
  return issues[0]?.message ?? null
}

export type SavedCollectionShape = {
  mint_mode: MintMode
  max_supply: number
  mint_price_etn: number | null
  burn_on_mint: boolean
  mint_burn_bps: number | null
}

export type SavedTokenShape = {
  token_id: number
  name: string
  image_storage_path: string | null
}

export function validateCollectionForPublish(
  collection: SavedCollectionShape,
  tokens: SavedTokenShape[],
): ValidationIssue[] {
  const complete = tokens.filter((t) => t.name.trim() && t.image_storage_path)
  const publicMint = Number(collection.mint_price_etn ?? 0) > 0
  const issues: ValidationIssue[] = []

  if (publicMint && complete.length < collection.max_supply) {
    issues.push({
      field: 'tokens',
      message: `Public mint requires metadata for all ${collection.max_supply} tokens (${complete.length} ready). Add artwork in the editor before publishing.`,
    })
  }

  if (collection.mint_mode === 'batch' && !publicMint && complete.length !== collection.max_supply) {
    issues.push({
      field: 'tokens',
      message: `Batch mint requires exactly ${collection.max_supply} tokens with images (${complete.length} ready).`,
    })
  }

  if (collection.mint_mode === 'lazy' && !publicMint && complete.length < 1) {
    issues.push({
      field: 'tokens',
      message: 'Lazy mint requires at least one token with artwork before publishing.',
    })
  }

  if (publicMint && Number(collection.mint_price_etn) < MIN_PUBLIC_MINT_ETN) {
    issues.push({
      field: 'mintPriceEtn',
      message: `Public mint price must be at least ${MIN_PUBLIC_MINT_ETN} ETN.`,
    })
  }

  if (collection.burn_on_mint && !publicMint) {
    issues.push({
      field: 'burnOnMint',
      message: 'Mint CLUB burn is configured but public mint is disabled. Update burn settings or enable public mint.',
    })
  }

  if (collection.burn_on_mint && Number(collection.mint_burn_bps ?? 0) <= 0) {
    issues.push({
      field: 'mintBurnPercent',
      message: 'Mint CLUB burn is enabled but percentage is zero. Set a mint burn % or turn off mint burn.',
    })
  }

  return issues
}
