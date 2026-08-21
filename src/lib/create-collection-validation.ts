import { validateImageFileSync } from '@/lib/validate-upload-image'

export type MintMode = 'lazy' | 'batch'

export type CreateCollectionForm = {
  name: string
  symbol: string
  description: string
  mintMode: MintMode
  maxSupply: number
  clubBurnAmount: string
  burnOnMint: boolean
  royaltyBurnPercent: string
  mintPriceEtn: string
  maxMintPerWallet: string
  enablePublicMint: boolean
}

export type DraftToken = {
  name: string
  description: string
  file: File | null
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

export function isTokenRowComplete(token: DraftToken): boolean {
  return Boolean(token.name.trim() && token.file)
}

export function isTokenRowEmpty(token: DraftToken): boolean {
  return !token.name.trim() && !token.description.trim() && !token.file
}

export function getCompleteTokens(tokens: DraftToken[]): DraftToken[] {
  return tokens.filter(isTokenRowComplete)
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
    next.clubBurnAmount = '0'
  }

  if (next.mintMode === 'batch' && !canEnablePublicMint(next, tokens)) {
    next.enablePublicMint = false
  }

  if (next.mintMode === 'batch' && !next.enablePublicMint && completeCount > 0) {
    next.maxSupply = completeCount
  }

  if (!next.enablePublicMint) {
    next.burnOnMint = false
  }

  return next
}

function validateTokenMetadata(tokens: DraftToken[], prefix: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const names = new Set<string>()

  tokens.forEach((token, index) => {
    const row = `${prefix}${index + 1}`
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

    if (!token.file) {
      issues.push({ field: `${row}.image`, message: 'An image is required for this token.' })
    } else {
      const imageError = validateImageFileSync(token.file)
      if (imageError) issues.push({ field: `${row}.image`, message: imageError })
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
  }

  if (step === 2) {
    const royalty = Number(f.royaltyBurnPercent)
    if (!Number.isFinite(royalty) || royalty < 0 || royalty > 100) {
      issues.push({ field: 'royaltyBurnPercent', message: 'Royalties burn must be between 0 and 100%.' })
    }

    if (f.burnOnMint && !f.enablePublicMint) {
      issues.push({
        field: 'burnOnMint',
        message: 'Mint CLUB burn only applies when ElectroSwap public mint is enabled.',
      })
    }

    if (f.burnOnMint) {
      const club = Number(f.clubBurnAmount)
      if (!Number.isFinite(club) || club <= 0) {
        issues.push({ field: 'clubBurnAmount', message: 'Enter a CLUB amount greater than 0, or turn off mint CLUB burn.' })
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
  club_burn_amount: number | null
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

  if (collection.burn_on_mint && Number(collection.club_burn_amount ?? 0) <= 0) {
    issues.push({
      field: 'clubBurnAmount',
      message: 'Mint CLUB burn is enabled but amount is zero. Set a CLUB amount or turn off mint burn.',
    })
  }

  return issues
}
