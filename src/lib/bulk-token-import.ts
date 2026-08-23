import type { DraftToken } from '@/lib/create-collection-validation'
import { findSequentialImportGaps, resolveBulkImportMaxSupplyFromIds } from '@/lib/collection-token-readiness'
import { parseMetadataJson, type ParsedTokenMetadata } from '@/lib/metadata-import'
import { validateImageFileSync } from '@/lib/validate-upload-image'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

export type BulkImportResult = {
  tokens: DraftToken[]
  warnings: string[]
  errors: string[]
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] ?? path
}

function tokenIdFromFilename(file: File): number | null {
  const path = file.webkitRelativePath || file.name
  const base = basename(path)
  const match = base.match(/^(\d+)\.([a-z0-9]+)$/i)
  if (!match) return null
  const id = Number(match[1])
  if (!Number.isInteger(id) || id < 1) return null
  return id
}

function isImageFile(file: File): boolean {
  const base = basename(file.webkitRelativePath || file.name)
  const ext = base.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXT.has(ext)) return true
  return file.type.startsWith('image/')
}

function isJsonFile(file: File): boolean {
  const base = basename(file.webkitRelativePath || file.name)
  return base.toLowerCase().endsWith('.json') || file.type === 'application/json'
}

export async function importBulkTokenFiles(
  files: File[],
  maxSupply: number,
): Promise<BulkImportResult> {
  const warnings: string[] = []
  const errors: string[] = []
  const byId = new Map<number, { image?: File; metadata?: ParsedTokenMetadata }>()

  for (const file of files) {
    const tokenId = tokenIdFromFilename(file)
    if (tokenId == null) {
      warnings.push(`Skipped "${file.webkitRelativePath || file.name}" — name must be like 1.png or 2.json.`)
      continue
    }

    const entry = byId.get(tokenId) ?? {}
    if (isImageFile(file)) {
      const syncError = validateImageFileSync(file)
      if (syncError) {
        errors.push(`Token #${tokenId}: ${syncError}`)
        continue
      }
      if (entry.image) {
        warnings.push(`Token #${tokenId}: Multiple images found — using "${file.name}".`)
      }
      entry.image = file
    } else if (isJsonFile(file)) {
      const parsed = await readMetadataFile(file, tokenId)
      if ('error' in parsed) {
        errors.push(parsed.error)
        continue
      }
      if (entry.metadata) {
        warnings.push(`Token #${tokenId}: Multiple JSON files found — using "${file.name}".`)
      }
      entry.metadata = parsed.data
    } else {
      warnings.push(`Skipped "${file.name}" — use PNG/JPEG/WebP/GIF or JSON.`)
    }
    byId.set(tokenId, entry)
  }

  if (byId.size === 0) {
    errors.push('No numbered files found. Name images and JSON as 1.png, 1.json, 2.png, 2.json, etc.')
    return { tokens: [], warnings, errors }
  }

  const sortedIds = [...byId.keys()].sort((a, b) => a - b)
  const gaps = findSequentialImportGaps(sortedIds)
  if (gaps.length > 0) {
    errors.push(
      `Bulk upload is missing numbered files for token${gaps.length === 1 ? '' : 's'} ${gaps
        .slice(0, 8)
        .map((id) => `#${id}`)
        .join(', ')}${gaps.length > 8 ? ` (+${gaps.length - 8} more)` : ''}. Add the missing files or renumber before importing.`,
    )
    return { tokens: [], warnings, errors }
  }

  const highestId = sortedIds[sortedIds.length - 1] ?? 0
  const resolvedSupply = resolveBulkImportMaxSupplyFromIds(sortedIds)
  if (resolvedSupply > maxSupply) {
    warnings.push(
      `Found tokens up to #${highestId} — max supply will be raised from ${maxSupply} to ${resolvedSupply}.`,
    )
  } else if (resolvedSupply > 0 && resolvedSupply < maxSupply) {
    warnings.push(
      `Imported ${sortedIds.length} numbered token(s). Max supply will be lowered from ${maxSupply} to ${resolvedSupply} to match your upload.`,
    )
  }

  const tokens: DraftToken[] = []
  const importErrors: string[] = []

  for (const tokenId of sortedIds) {
    const entry = byId.get(tokenId)!
    if (!entry.image) {
      importErrors.push(`Token #${tokenId}: Missing image file (expected ${tokenId}.png or similar).`)
      continue
    }

    const name = entry.metadata?.name?.trim() || `Token #${tokenId}`
    const description = entry.metadata?.description ?? ''
    const attributes = entry.metadata?.attributes ?? []

    if (!entry.metadata) {
      warnings.push(`Token #${tokenId}: No JSON file — using default name and empty attributes.`)
    }

    tokens.push({ tokenId, name, description, file: entry.image, attributes })
  }

  return { tokens, warnings, errors: [...errors, ...importErrors] }
}

async function readMetadataFile(file: File, tokenId: number) {
  const text = await file.text()
  return parseMetadataJson(text, `Token #${tokenId} (${file.name})`)
}
