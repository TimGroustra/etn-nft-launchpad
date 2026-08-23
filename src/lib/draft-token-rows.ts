import type { DraftToken } from '@/lib/create-collection-validation'
import type { CollectionToken } from '@/types/database'
import type { NftAttribute } from '@/lib/nft-metadata'
import { resolveBulkImportMaxSupplyFromIds } from '@/lib/collection-token-readiness'
import { assertStoragePathForCollection } from '@/lib/storage-paths'

export function resolveBulkImportMaxSupply(imported: DraftToken[]): number {
  const tokenIds = imported
    .map((token) => token.tokenId)
    .filter((id): id is number => id != null && id > 0)
  return resolveBulkImportMaxSupplyFromIds(tokenIds)
}

export function getRowTokenId(token: DraftToken, rowIndex: number): number {
  return token.tokenId ?? rowIndex + 1
}

/** Keep a single DB row per token_id — newest updated_at wins. */
export function dedupeDbTokensByTokenId(tokens: CollectionToken[]): CollectionToken[] {
  const byTokenId = new Map<number, CollectionToken>()
  const withoutTokenId: CollectionToken[] = []

  for (const token of tokens) {
    if (token.token_id == null) {
      withoutTokenId.push(token)
      continue
    }

    const existing = byTokenId.get(token.token_id)
    if (!existing) {
      byTokenId.set(token.token_id, token)
      continue
    }

    const existingTime = new Date(existing.updated_at).getTime()
    const nextTime = new Date(token.updated_at).getTime()
    if (nextTime > existingTime || (nextTime === existingTime && token.id > existing.id)) {
      byTokenId.set(token.token_id, token)
    }
  }

  return [...byTokenId.values(), ...withoutTokenId].sort(
    (a, b) => (a.token_id ?? 0) - (b.token_id ?? 0),
  )
}

/** Empty slot for max-supply padding — must not look "started" to validation. */
export function createEmptyTokenRow(tokenId: number): DraftToken {
  return {
    tokenId,
    name: '',
    description: '',
    file: null,
    attributes: [],
  }
}

/** Pad sparse bulk imports into editable rows keyed by filename token id. */
export function buildEditableTokenRows(imported: DraftToken[], maxSupply: number): DraftToken[] {
  if (imported.length === 0) return []

  const withIds = imported.map((token, index) => ({
    ...token,
    tokenId: token.tokenId ?? index + 1,
  }))

  const highestId = Math.max(...withIds.map((token) => token.tokenId!))
  const rowCount = Math.max(maxSupply, highestId, withIds.length)

  const byId = new Map(withIds.map((token) => [token.tokenId!, token]))
  const rows: DraftToken[] = []

  for (let id = 1; id <= rowCount; id++) {
    rows.push(byId.get(id) ?? createEmptyTokenRow(id))
  }

  return rows
}

export function dbTokenToDraft(token: CollectionToken, collectionId: string): DraftToken {
  const attributes = Array.isArray(token.attributes)
    ? (token.attributes as NftAttribute[])
    : []

  const imagePath =
    token.image_storage_path &&
    !assertStoragePathForCollection(collectionId, token.image_storage_path)
      ? token.image_storage_path
      : undefined

  return {
    tokenId: token.token_id ?? undefined,
    dbTokenId: token.id,
    name: token.name,
    description: token.description ?? '',
    file: null,
    existingImagePath: imagePath,
    attributes,
  }
}

export function buildDraftRowsFromDb(
  dbTokens: CollectionToken[],
  maxSupply: number,
  collectionId: string,
): DraftToken[] {
  const deduped = dedupeDbTokensByTokenId(dbTokens)

  if (deduped.length === 0) {
    return [createEmptyTokenRow(1)]
  }

  const drafts = deduped.map((token) => dbTokenToDraft(token, collectionId))
  const highestId = Math.max(...drafts.map((t) => t.tokenId ?? 0))
  const rowCount = Math.max(maxSupply, highestId, drafts.length)

  const byId = new Map<number, DraftToken>()
  for (const draft of drafts) {
    if (draft.tokenId != null) byId.set(draft.tokenId, draft)
  }

  const rows: DraftToken[] = []
  for (let id = 1; id <= rowCount; id++) {
    rows.push(byId.get(id) ?? createEmptyTokenRow(id))
  }

  return rows.slice(0, Math.max(rowCount, 1))
}
