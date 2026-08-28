import { batchUpsertTokens, uploadImage } from '@/lib/api'
import {
  buildCollectionStagedFileKey,
  clearStagedDraftFiles,
  getStagedDraftFile,
  migrateSessionStagedFiles,
} from '@/lib/draft-file-store'
import { mapWithConcurrency, withRetry } from '@/lib/resilient-retry'
import { validateImageFileAsync } from '@/lib/validate-upload-image'
import type { DraftToken } from '@/lib/create-collection-validation'
import { getTokenAttributesForSave } from '@/lib/create-collection-validation'
import { validateCollectionImagePath } from '@/lib/storage-paths'
import type { CollectionToken } from '@/types/database'

export const UPLOAD_CONCURRENCY = 4
export const UPLOAD_RETRY_ROUNDS = 3
export const TOKEN_DB_BATCH_SIZE = 50

export type UploadProgressDetail = {
  phase: 'validating' | 'uploading' | 'saving'
  completed: number
  total: number
  tokenId?: number
  retrying?: boolean
}

export type PreparedUploadRow = {
  token: DraftToken
  rowIndex: number
  tokenId: number
}

export type UploadedTokenRow = PreparedUploadRow & {
  imagePath: string
}

function uploadConcurrencyFor(total: number): number {
  if (total >= 2_000) return 6
  if (total >= 500) return 5
  return UPLOAD_CONCURRENCY
}

export async function resolveTokenImageFile(
  token: DraftToken,
  collectionId: string,
  tokenId: number,
): Promise<File | null> {
  if (token.file) return token.file
  if (token.stagedFileKey) return getStagedDraftFile(token.stagedFileKey)
  return getStagedDraftFile(buildCollectionStagedFileKey(collectionId, tokenId))
}

export async function uploadTokenImageResilient(
  walletAddress: string,
  collectionId: string,
  tokenId: number,
  file: File,
  onRetry?: (attempt: number) => void,
): Promise<string> {
  const imageError = await validateImageFileAsync(file)
  if (imageError) {
    throw new Error(`Token #${tokenId}: ${imageError}`)
  }

  return withRetry(
    () => uploadImage(walletAddress, collectionId, tokenId, file),
    {
      maxAttempts: 5,
      onRetry: (error, attempt) => {
        console.warn(`Token #${tokenId} upload retry ${attempt}:`, error)
        onRetry?.(attempt)
      },
    },
  )
}

async function uploadRowsWithRetries(
  walletAddress: string,
  collectionId: string,
  rows: PreparedUploadRow[],
  onProgress?: (detail: UploadProgressDetail) => void,
): Promise<UploadedTokenRow[]> {
  const pending = [...rows]
  const completed = new Map<number, UploadedTokenRow>()
  const concurrency = uploadConcurrencyFor(rows.length)

  for (let round = 0; round < UPLOAD_RETRY_ROUNDS && pending.length > 0; round++) {
    const failed: PreparedUploadRow[] = []
    let processed = completed.size

    await mapWithConcurrency(pending, concurrency, async (row) => {
      const file = await resolveTokenImageFile(row.token, collectionId, row.tokenId)
      if (!file) {
        failed.push(row)
        return
      }

      try {
        const imagePath = await uploadTokenImageResilient(
          walletAddress,
          collectionId,
          row.tokenId,
          file,
          () => {
            onProgress?.({
              phase: 'uploading',
              completed: processed,
              total: rows.length,
              tokenId: row.tokenId,
              retrying: true,
            })
          },
        )
        completed.set(row.tokenId, { ...row, imagePath })
        processed = completed.size
        onProgress?.({
          phase: 'uploading',
          completed: processed,
          total: rows.length,
          tokenId: row.tokenId,
        })
      } catch {
        failed.push(row)
      }
    })

    pending.splice(0, pending.length, ...failed)
  }

  if (pending.length > 0) {
    const failedIds = pending.map((row) => row.tokenId).slice(0, 8)
    const suffix = pending.length > 8 ? ` (+${pending.length - 8} more)` : ''
    throw new Error(
      `Upload failed for ${pending.length} token${pending.length === 1 ? '' : 's'}: #${failedIds.join(', #')}${suffix}. Save again to resume.`,
    )
  }

  return rows.map((row) => completed.get(row.tokenId)!)
}

export async function persistUploadedTokens(
  walletAddress: string,
  collectionId: string,
  uploadedRows: UploadedTokenRow[],
  existingByTokenId: Map<number, CollectionToken>,
  existingByDbId: Map<string, CollectionToken>,
  onProgress?: (detail: UploadProgressDetail) => void,
): Promise<Map<number, string>> {
  const keptByTokenId = new Map<number, string>()
  const payloads = uploadedRows.map((row) => {
    const payload = {
      tokenId: row.tokenId,
      name: row.token.name.trim(),
      description: row.token.description.trim(),
      attributes: getTokenAttributesForSave(row.token),
      imageStoragePath: row.imagePath,
      editionSize: Math.max(1, Number(row.token.editionSize ?? 1)),
    }

    const existingRow =
      (row.token.dbTokenId ? existingByDbId.get(row.token.dbTokenId) : undefined) ??
      existingByTokenId.get(row.tokenId)

    return {
      ...payload,
      dbId: existingRow?.id,
    }
  })

  for (let start = 0; start < payloads.length; start += TOKEN_DB_BATCH_SIZE) {
    const chunk = payloads.slice(start, start + TOKEN_DB_BATCH_SIZE)
    const batchPayload = chunk.map(({ dbId, ...token }) => token)

    const saved = await withRetry(
      () =>
        batchUpsertTokens(walletAddress, {
          collectionId,
          tokens: batchPayload,
        }),
      { maxAttempts: 4 },
    )

    for (const token of saved) {
      if (token.token_id != null) {
        keptByTokenId.set(token.token_id, token.id)
      }
    }

    onProgress?.({
      phase: 'saving',
      completed: Math.min(start + chunk.length, payloads.length),
      total: payloads.length,
    })
  }

  return keptByTokenId
}

export async function uploadAndPersistDraftTokens(
  walletAddress: string,
  collectionId: string,
  activeRows: PreparedUploadRow[],
  existingByTokenId: Map<number, CollectionToken>,
  existingByDbId: Map<string, CollectionToken>,
  options?: {
    importSessionId?: string | null
    onProgress?: (detail: UploadProgressDetail) => void
  },
): Promise<Map<number, string>> {
  if (options?.importSessionId) {
    await migrateSessionStagedFiles(
      options.importSessionId,
      collectionId,
      activeRows.map((row) => row.tokenId),
    )
  }

  const uploadRows: PreparedUploadRow[] = []
  const alreadyUploaded: UploadedTokenRow[] = []

  for (const row of activeRows) {
    const file = await resolveTokenImageFile(row.token, collectionId, row.tokenId)
    const existingRow =
      (row.token.dbTokenId ? existingByDbId.get(row.token.dbTokenId) : undefined) ??
      existingByTokenId.get(row.tokenId)
    const existingPath = row.token.existingImagePath ?? existingRow?.image_storage_path ?? undefined

    if (!file && existingPath) {
      const pathError = validateCollectionImagePath(collectionId, row.tokenId, existingPath)
      if (pathError) throw new Error(`Token #${row.tokenId}: ${pathError}`)
      alreadyUploaded.push({ ...row, imagePath: existingPath })
      continue
    }

    if (!file) {
      throw new Error(`Token #${row.tokenId} is missing an image.`)
    }

    uploadRows.push(row)
  }

  options?.onProgress?.({
    phase: 'uploading',
    completed: alreadyUploaded.length,
    total: activeRows.length,
  })

  const newlyUploaded = uploadRows.length
    ? await uploadRowsWithRetries(walletAddress, collectionId, uploadRows, options?.onProgress)
    : []

  const allUploaded = [...alreadyUploaded, ...newlyUploaded].sort((a, b) => a.tokenId - b.tokenId)
  const keptByTokenId = await persistUploadedTokens(
    walletAddress,
    collectionId,
    allUploaded,
    existingByTokenId,
    existingByDbId,
    options?.onProgress,
  )

  const stagedKeys = allUploaded
    .map((row) => row.token.stagedFileKey ?? buildCollectionStagedFileKey(collectionId, row.tokenId))
    .filter(Boolean) as string[]
  await clearStagedDraftFiles(stagedKeys)

  return keptByTokenId
}
