import type { NftAttribute } from './nft-metadata.ts'
import { validateAttributesList } from './nft-metadata.ts'
import { validateCollectionImagePath } from './storage-paths.ts'

export type MintMode = 'lazy' | 'batch'

export const MIN_PUBLIC_MINT_ETN = 1
export const MAX_SUPPLY = 100_000
export const TOKEN_NAME_MAX = 80
export const TOKEN_DESC_MAX = 2000
export const COLLECTION_NAME_MAX = 80
export const COLLECTION_DESC_MAX = 2000

const SYMBOL_RE = /^[A-Z0-9]{2,12}$/

export type CollectionPayload = {
  name: string
  symbol: string
  description?: string
  mintMode?: MintMode
  maxSupply?: number
  mintBurnBps?: number
  burnOnMint?: boolean
  royaltyBurnBps?: number
  mintPriceEtn?: number
  maxMintPerWallet?: number
  showOnMintPanel?: boolean
}

export type TokenPayload = {
  collectionId?: string
  tokenId?: number
  name: string
  description?: string
  imageStoragePath?: string | null
  attributes?: NftAttribute[]
}

export function validateCollectionPayload(body: CollectionPayload): string | null {
  const name = String(body.name ?? '').trim()
  if (!name) return 'Collection name is required.'
  if (name.length < 2) return 'Collection name must be at least 2 characters.'
  if (name.length > COLLECTION_NAME_MAX) {
    return `Collection name must be ${COLLECTION_NAME_MAX} characters or fewer.`
  }

  const symbol = String(body.symbol ?? '').trim().toUpperCase()
  if (!symbol) return 'Symbol is required.'
  if (!SYMBOL_RE.test(symbol)) return 'Symbol must be 2–12 letters or numbers (A–Z, 0–9).'

  const description = String(body.description ?? '')
  if (description.length > COLLECTION_DESC_MAX) {
    return `Description must be ${COLLECTION_DESC_MAX} characters or fewer.`
  }

  const maxSupply = Number(body.maxSupply ?? 0)
  if (!Number.isInteger(maxSupply) || maxSupply < 1) return 'Max supply must be a whole number of at least 1.'
  if (maxSupply > MAX_SUPPLY) return `Max supply cannot exceed ${MAX_SUPPLY}.`

  const mintPriceEtn = Number(body.mintPriceEtn ?? 0)
  const mintMode = (body.mintMode ?? 'lazy') as MintMode
  const burnOnMint = Boolean(body.burnOnMint)
  const mintBurnBps = Number(body.mintBurnBps ?? 0)
  const royaltyBurnBps = Number(body.royaltyBurnBps ?? 0)
  const maxMintPerWallet = Number(body.maxMintPerWallet ?? 0)

  if (royaltyBurnBps < 0 || royaltyBurnBps > 10000) {
    return 'Royalties burn must be between 0 and 100%.'
  }

  if (mintPriceEtn > 0) {
    if (mintPriceEtn < MIN_PUBLIC_MINT_ETN) {
      return `Public mint price must be at least ${MIN_PUBLIC_MINT_ETN} ETN.`
    }
    if (!Number.isInteger(maxMintPerWallet) || maxMintPerWallet < 0) {
      return 'Max mints per wallet must be a whole number (0 = unlimited).'
    }
    if (maxMintPerWallet > maxSupply) {
      return 'Max mints per wallet cannot exceed max supply.'
    }
  } else if (burnOnMint) {
    return 'Mint CLUB burn requires a public mint price.'
  }

  if (burnOnMint && mintBurnBps <= 0) {
    return 'Mint CLUB burn requires a percentage greater than 0.'
  }

  if (burnOnMint && mintBurnBps > 10_000) {
    return 'Mint CLUB burn cannot exceed 100%.'
  }

  if (mintMode !== 'lazy' && mintMode !== 'batch') {
    return 'Invalid mint mode.'
  }

  if (body.showOnMintPanel && mintPriceEtn <= 0) {
    return 'Public mint must be enabled before listing on the NFT Minting Panel.'
  }

  return null
}

export function validateTokenPayload(body: TokenPayload): string | null {
  const name = String(body.name ?? '').trim()
  if (!name) return 'Token name is required.'
  if (name.length > TOKEN_NAME_MAX) return `Token name must be ${TOKEN_NAME_MAX} characters or fewer.`

  const description = String(body.description ?? '')
  if (description.length > TOKEN_DESC_MAX) {
    return `Description must be ${TOKEN_DESC_MAX} characters or fewer.`
  }

  if (!body.imageStoragePath) return 'Token image is required.'

  if (body.collectionId && body.tokenId !== undefined) {
    const pathError = validateCollectionImagePath(
      body.collectionId,
      Number(body.tokenId),
      String(body.imageStoragePath),
    )
    if (pathError) return pathError
  }

  const attributes = (body.attributes ?? []) as NftAttribute[]
  const attrError = validateAttributesList(attributes, 'Token')
  if (attrError) return attrError

  return null
}

