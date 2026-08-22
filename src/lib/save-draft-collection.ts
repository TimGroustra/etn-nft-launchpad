import { addToken, deleteToken, updateCollection, updateToken, uploadImage } from '@/lib/api'
import {
  getTokenAttributesForSave,
  isTokenRowEmpty,
  MIN_PUBLIC_MINT_ETN,
  percentToBps,
  sanitizeFormForMode,
  type CreateCollectionForm,
  type DraftToken,
} from '@/lib/create-collection-validation'
import { dedupeDbTokensByTokenId, getRowTokenId } from '@/lib/draft-token-rows'
import type { NftAttribute } from '@/lib/nft-metadata'
import { assertStoragePathForCollection, validateCollectionImagePath } from '@/lib/storage-paths'
import type { Collection, CollectionToken } from '@/types/database'

export type CollectionEditChanges = {
  mintPanelChanged: boolean
  metadataChanged: boolean
  hasChanges: boolean
  needsOnChainSync: boolean
}

function normalizeDbAttributes(attributes: unknown): NftAttribute[] {
  if (!Array.isArray(attributes)) return []
  return attributes
    .filter((attr): attr is NftAttribute => typeof attr === 'object' && attr !== null && 'trait_type' in attr)
    .map((attr) => ({ trait_type: String(attr.trait_type).trim(), value: attr.value }))
    .filter((attr) => attr.trait_type && String(attr.value).trim() !== '')
}

function draftImagePath(collectionId: string, token: DraftToken): string | undefined {
  if (token.file) return undefined
  const path = token.existingImagePath
  if (!path || assertStoragePathForCollection(collectionId, path)) return undefined
  return path
}

export function getCollectionEditChanges(
  tokens: DraftToken[],
  dbTokens: CollectionToken[],
  collection: Collection,
  showOnMintPanel: boolean,
): CollectionEditChanges {
  const mintPanelChanged = showOnMintPanel !== Boolean(collection.show_on_mint_panel)

  const deduped = dedupeDbTokensByTokenId(dbTokens)
  const dbByTokenId = new Map(
    deduped.filter((token) => token.token_id != null).map((token) => [token.token_id!, token]),
  )

  let metadataChanged = false
  const activeTokenIds = new Set<number>()

  for (let rowIndex = 0; rowIndex < tokens.length; rowIndex++) {
    const token = tokens[rowIndex]
    const tokenId = getRowTokenId(token, rowIndex)

    if (isTokenRowEmpty(token)) {
      if (dbByTokenId.has(tokenId)) metadataChanged = true
      continue
    }

    activeTokenIds.add(tokenId)
    const dbRow = dbByTokenId.get(tokenId)

    if (!dbRow) {
      metadataChanged = true
      continue
    }

    if (
      token.file ||
      token.name.trim() !== dbRow.name ||
      token.description.trim() !== (dbRow.description ?? '') ||
      JSON.stringify(getTokenAttributesForSave(token)) !== JSON.stringify(normalizeDbAttributes(dbRow.attributes)) ||
      draftImagePath(collection.id, token) !== (dbRow.image_storage_path ?? undefined)
    ) {
      metadataChanged = true
    }
  }

  if (!metadataChanged) {
    for (const dbRow of deduped) {
      if (dbRow.token_id != null && !activeTokenIds.has(dbRow.token_id)) {
        metadataChanged = true
        break
      }
    }
  }

  const hasChanges = mintPanelChanged || metadataChanged
  const needsOnChainSync = Boolean(collection.contract_address) && metadataChanged

  return { mintPanelChanged, metadataChanged, hasChanges, needsOnChainSync }
}

export function buildEditCollectionForm(
  collection: Collection,
  showOnMintPanel: boolean,
): CreateCollectionForm {
  return {
    ...collectionToForm(collection),
    showOnMintPanel,
  }
}

export async function saveDraftCollection(
  walletAddress: string,
  collectionId: string,
  form: CreateCollectionForm,
  tokens: DraftToken[],
  existingDbTokens: CollectionToken[] = [],
  collectionMeta?: Pick<Collection, 'chain_id'>,
) {
  const sanitized = sanitizeFormForMode(form, tokens)
  const dedupedExisting = dedupeDbTokensByTokenId(existingDbTokens)
  const existingByDbId = new Map(dedupedExisting.map((token) => [token.id, token]))
  const existingByTokenId = new Map(
    dedupedExisting
      .filter((token) => token.token_id != null)
      .map((token) => [token.token_id!, token]),
  )

  await updateCollection(walletAddress, collectionId, {
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
    chainId: collectionMeta?.chain_id ?? undefined,
  })

  const keptByTokenId = new Map<number, string>()

  for (let rowIndex = 0; rowIndex < tokens.length; rowIndex++) {
    const token = tokens[rowIndex]
    if (isTokenRowEmpty(token)) continue

    const tokenId = getRowTokenId(token, rowIndex)
    let imagePath = token.existingImagePath ?? undefined

    if (token.file) {
      imagePath = await uploadImage(walletAddress, collectionId, tokenId, token.file)
    } else if (imagePath) {
      const pathError = validateCollectionImagePath(collectionId, tokenId, imagePath)
      if (pathError) throw new Error(`Token #${tokenId}: ${pathError}`)
    }

    if (!imagePath) {
      throw new Error(`Token #${tokenId} is missing an image.`)
    }

    const payload = {
      name: token.name.trim(),
      description: token.description.trim(),
      attributes: getTokenAttributesForSave(token),
      imageStoragePath: imagePath,
    }

    const existingRow =
      (token.dbTokenId ? existingByDbId.get(token.dbTokenId) : undefined) ??
      existingByTokenId.get(tokenId)

    if (existingRow) {
      await updateToken(walletAddress, {
        tokenId: existingRow.id,
        tokenNumber: tokenId,
        ...payload,
      })
      keptByTokenId.set(tokenId, existingRow.id)
    } else {
      const created = await addToken(walletAddress, {
        collectionId,
        tokenId,
        ...payload,
      })
      keptByTokenId.set(tokenId, created.id)
    }
  }

  for (const existing of existingDbTokens) {
    if (existing.token_id == null) continue
    const keptId = keptByTokenId.get(existing.token_id)
    if (keptId && existing.id !== keptId) {
      await deleteToken(walletAddress, existing.id)
    }
  }
}

export function collectionToUpdatePayload(collection: Collection, overrides: Record<string, unknown> = {}) {
  return {
    name: collection.name,
    symbol: collection.symbol,
    description: collection.description ?? '',
    mintMode: collection.mint_mode,
    maxSupply: collection.max_supply,
    mintBurnBps: collection.mint_burn_bps ?? 0,
    burnOnMint: collection.burn_on_mint,
    royaltyBurnBps: collection.royalty_burn_bps ?? 0,
    mintPriceEtn: Number(collection.mint_price_etn ?? 0),
    maxMintPerWallet: collection.max_mint_per_wallet ?? 0,
    showOnMintPanel: collection.show_on_mint_panel ?? false,
    chainId: collection.chain_id,
    ...overrides,
  }
}

export function collectionToForm(collection: Collection): CreateCollectionForm {
  const publicMint = Number(collection.mint_price_etn ?? 0) > 0
  const mintBurnBps = Number(collection.mint_burn_bps ?? 0)
  const royaltyBurnBps = Number(collection.royalty_burn_bps ?? 0)

  return {
    name: collection.name,
    symbol: collection.symbol,
    description: collection.description ?? '',
    mintMode: collection.mint_mode,
    maxSupply: Number(collection.max_supply),
    mintBurnPercent: mintBurnBps ? String(mintBurnBps / 100) : '0',
    burnOnMint: collection.burn_on_mint,
    royaltyBurnPercent: royaltyBurnBps ? String(royaltyBurnBps / 100) : '0',
    mintPriceEtn: publicMint ? String(Number(collection.mint_price_etn)) : String(MIN_PUBLIC_MINT_ETN),
    maxMintPerWallet: String(Number(collection.max_mint_per_wallet ?? 0)),
    enablePublicMint: publicMint,
    showOnMintPanel: collection.show_on_mint_panel ?? false,
  }
}
