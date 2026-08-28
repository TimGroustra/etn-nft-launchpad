import { deleteToken, updateCollection } from '@/lib/api'
import {
  type PreparedUploadRow,
  type UploadProgressDetail,
  uploadAndPersistDraftTokens,
} from '@/lib/collection-upload'
import {
  clampRoyaltyBurnPercent,
  clampMintBurnPercent,
  getTokenAttributesForSave,
  isTokenRowEmpty,
  MIN_MINT_BURN_PERCENT,
  MIN_PUBLIC_MINT_ETN,
  MIN_ROYALTY_BURN_PERCENT,
  mintBurnBpsFromPercent,
  percentToBps,
  royaltyBurnBpsFromPercent,
  sanitizeFormForMode,
  type CreateCollectionForm,
  type DraftToken,
} from '@/lib/create-collection-validation'
import { dedupeDbTokensByTokenId, getRowTokenId } from '@/lib/draft-token-rows'
import type { NftAttribute } from '@/lib/nft-metadata'
import { assertStoragePathForCollection } from '@/lib/storage-paths'
import type { Collection, CollectionToken } from '@/types/database'

export type CollectionEditChanges = {
  mintPanelChanged: boolean
  mintPanelAdminOnlyChanged: boolean
  metadataChanged: boolean
  royaltySettingsChanged: boolean
  hasChanges: boolean
  needsOnChainSync: boolean
  needsRoyaltyOnChainSync: boolean
  needsRoyaltyBurnOnChainSync: boolean
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
  options: {
    showOnMintPanel: boolean
    mintPanelAdminOnly: boolean
    royaltyPercent: string
    royaltyBurnPercent: string
  },
): CollectionEditChanges {
  const mintPanelChanged = options.showOnMintPanel !== Boolean(collection.show_on_mint_panel)
  const mintPanelAdminOnlyChanged =
    options.mintPanelAdminOnly !== Boolean(collection.mint_panel_admin_only)
  const royaltyBps = percentToBps(Number(options.royaltyPercent))
  const royaltyBurnBps = royaltyBurnBpsFromPercent(options.royaltyBurnPercent)
  const royaltySettingsChanged =
    royaltyBps !== (collection.royalty_bps ?? 500) ||
    royaltyBurnBps !== (collection.royalty_burn_bps ?? 0)

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
      draftImagePath(collection.id, token) !== (dbRow.image_storage_path ?? undefined) ||
      Math.max(1, Number(token.editionSize ?? 1)) !== Math.max(1, Number(dbRow.edition_size ?? 1))
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

  const hasChanges =
    mintPanelChanged || mintPanelAdminOnlyChanged || metadataChanged || royaltySettingsChanged
  const needsOnChainSync = Boolean(collection.contract_address) && metadataChanged
  const needsRoyaltyOnChainSync =
    Boolean(collection.contract_address) && royaltyBps !== (collection.royalty_bps ?? 500)
  const needsRoyaltyBurnOnChainSync =
    Boolean(collection.contract_address) && royaltyBurnBps !== (collection.royalty_burn_bps ?? 0)

  return {
    mintPanelChanged,
    mintPanelAdminOnlyChanged,
    metadataChanged,
    royaltySettingsChanged,
    hasChanges,
    needsOnChainSync,
    needsRoyaltyOnChainSync,
    needsRoyaltyBurnOnChainSync,
  }
}

export function buildEditCollectionForm(
  collection: Collection,
  overrides: Partial<CreateCollectionForm> = {},
): CreateCollectionForm {
  return {
    ...collectionToForm(collection),
    ...overrides,
  }
}

export async function saveDraftCollection(
  walletAddress: string,
  collectionId: string,
  form: CreateCollectionForm,
  tokens: DraftToken[],
  existingDbTokens: CollectionToken[] = [],
  collectionMeta?: Pick<Collection, 'chain_id' | 'name' | 'symbol' | 'description' | 'mint_mode' | 'max_supply' | 'mint_burn_bps' | 'burn_on_mint' | 'royalty_burn_bps' | 'royalty_bps' | 'mint_price_etn' | 'max_mint_per_wallet' | 'show_on_mint_panel' | 'mint_panel_admin_only' | 'random_public_mint'>,
  onProgress?: (completed: number, total: number) => void,
  options?: {
    importSessionId?: string | null
    onDetailProgress?: (detail: UploadProgressDetail) => void
  },
) {
  const sanitized = sanitizeFormForMode(form, tokens)
  const dedupedExisting = dedupeDbTokensByTokenId(existingDbTokens)
  const existingByDbId = new Map(dedupedExisting.map((token) => [token.id, token]))
  const existingByTokenId = new Map(
    dedupedExisting
      .filter((token) => token.token_id != null)
      .map((token) => [token.token_id!, token]),
  )

  if (!collectionMeta || !collectionFormMatchesCollection(sanitized, collectionMeta)) {
    await updateCollection(walletAddress, collectionId, {
      name: sanitized.name.trim(),
      symbol: sanitized.symbol.trim().toUpperCase(),
      description: sanitized.description,
      mintMode: sanitized.mintMode,
      maxSupply: sanitized.maxSupply,
      mintBurnBps:
        sanitized.mintMode === 'lazy'
          ? mintBurnBpsFromPercent(sanitized.mintBurnPercent)
          : percentToBps(Number(sanitized.mintBurnPercent)),
      burnOnMint: sanitized.burnOnMint,
      royaltyBurnBps: royaltyBurnBpsFromPercent(sanitized.royaltyBurnPercent),
      royaltyBps: percentToBps(Number(sanitized.royaltyPercent)),
      mintPriceEtn: sanitized.enablePublicMint ? Number(sanitized.mintPriceEtn) : 0,
      maxMintPerWallet: Number(sanitized.maxMintPerWallet) || 0,
      showOnMintPanel: sanitized.enablePublicMint && sanitized.showOnMintPanel,
      ...(sanitized.mintPanelAdminOnly !== undefined
        ? { mintPanelAdminOnly: sanitized.enablePublicMint && sanitized.mintPanelAdminOnly }
        : {}),
      randomPublicMint: sanitized.enablePublicMint && sanitized.randomPublicMint,
      chainId: collectionMeta?.chain_id ?? undefined,
    })
  }

  const keptByTokenId = new Map<number, string>()
  const activeRows: PreparedUploadRow[] = []

  for (let rowIndex = 0; rowIndex < tokens.length; rowIndex++) {
    const token = tokens[rowIndex]
    if (isTokenRowEmpty(token)) continue
    activeRows.push({ token, rowIndex, tokenId: getRowTokenId(token, rowIndex) })
  }

  onProgress?.(0, activeRows.length)
  options?.onDetailProgress?.({ phase: 'uploading', completed: 0, total: activeRows.length })

  const uploaded = await uploadAndPersistDraftTokens(
    walletAddress,
    collectionId,
    activeRows,
    existingByTokenId,
    existingByDbId,
    {
      importSessionId: options?.importSessionId,
      onProgress: (detail) => {
        options?.onDetailProgress?.(detail)
        if (detail.phase === 'uploading') {
          onProgress?.(detail.completed, detail.total)
        }
      },
    },
  )

  for (const [tokenId, dbId] of uploaded.entries()) {
    keptByTokenId.set(tokenId, dbId)
  }

  for (const existing of dedupedExisting) {
    if (existing.token_id == null) continue
    const keptId = keptByTokenId.get(existing.token_id)
    if (keptId === existing.id) continue
    await deleteToken(walletAddress, existing.id)
  }
}

function collectionFormMatchesCollection(
  form: CreateCollectionForm,
  collection: Pick<
    Collection,
    | 'name'
    | 'symbol'
    | 'description'
    | 'mint_mode'
    | 'max_supply'
    | 'mint_burn_bps'
    | 'burn_on_mint'
    | 'royalty_burn_bps'
    | 'royalty_bps'
    | 'mint_price_etn'
    | 'max_mint_per_wallet'
    | 'show_on_mint_panel'
    | 'mint_panel_admin_only'
    | 'random_public_mint'
    | 'chain_id'
  >,
): boolean {
  const current = collectionToForm(collection as Collection)
  return (
    form.name.trim() === current.name.trim() &&
    form.symbol.trim().toUpperCase() === current.symbol.trim().toUpperCase() &&
    form.description === current.description &&
    form.mintMode === current.mintMode &&
    form.maxSupply === current.maxSupply &&
    form.mintBurnPercent === current.mintBurnPercent &&
    form.burnOnMint === current.burnOnMint &&
    form.royaltyBurnPercent === current.royaltyBurnPercent &&
    form.royaltyPercent === current.royaltyPercent &&
    form.mintPriceEtn === current.mintPriceEtn &&
    form.maxMintPerWallet === current.maxMintPerWallet &&
    form.enablePublicMint === current.enablePublicMint &&
    form.showOnMintPanel === current.showOnMintPanel &&
    (form.mintPanelAdminOnly ?? false) === (current.mintPanelAdminOnly ?? false) &&
    form.randomPublicMint === current.randomPublicMint
  )
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
    royaltyBps: collection.royalty_bps ?? 500,
    mintPriceEtn: Number(collection.mint_price_etn ?? 0),
    maxMintPerWallet: collection.max_mint_per_wallet ?? 0,
    showOnMintPanel: collection.show_on_mint_panel ?? false,
    mintPanelAdminOnly: collection.mint_panel_admin_only ?? false,
    randomPublicMint: collection.random_public_mint ?? false,
    chainId: collection.chain_id,
    ...overrides,
  }
}

export function collectionToForm(collection: Collection): CreateCollectionForm {
  const publicMint = Number(collection.mint_price_etn ?? 0) > 0
  const mintBurnBps = Number(collection.mint_burn_bps ?? 0)
  const royaltyBurnBps = Number(collection.royalty_burn_bps ?? 0)
  const royaltyBps = Number(collection.royalty_bps ?? 500)

  return {
    name: collection.name,
    symbol: collection.symbol,
    description: collection.description ?? '',
    tokenStandard: collection.token_standard === 'erc1155' ? 'erc1155' : 'erc721',
    mintMode: collection.mint_mode,
    maxSupply: Number(collection.max_supply),
    mintBurnPercent:
      collection.mint_mode === 'lazy'
        ? clampMintBurnPercent(mintBurnBps ? String(mintBurnBps / 100) : String(MIN_MINT_BURN_PERCENT))
        : mintBurnBps
          ? String(mintBurnBps / 100)
          : '0',
    burnOnMint: collection.mint_mode === 'lazy' ? true : collection.burn_on_mint,
    royaltyBurnPercent: clampRoyaltyBurnPercent(
      royaltyBurnBps ? String(royaltyBurnBps / 100) : String(MIN_ROYALTY_BURN_PERCENT),
    ),
    royaltyPercent: royaltyBps ? String(royaltyBps / 100) : '5',
    mintPriceEtn: publicMint ? String(Number(collection.mint_price_etn)) : String(MIN_PUBLIC_MINT_ETN),
    maxMintPerWallet: String(Number(collection.max_mint_per_wallet ?? 0)),
    enablePublicMint: publicMint,
    randomPublicMint: publicMint && (collection.random_public_mint ?? false),
    showOnMintPanel: collection.show_on_mint_panel ?? false,
    mintPanelAdminOnly: collection.mint_panel_admin_only ?? false,
  }
}
