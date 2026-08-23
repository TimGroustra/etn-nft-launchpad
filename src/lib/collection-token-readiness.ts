export type TokenCoverageRow = {
  token_id: number | null
  name: string
  image_storage_path: string | null
}

export type TokenCoverageAnalysis = {
  missingIds: number[]
  incompleteIds: number[]
  readyCount: number
}

function formatTokenIdList(ids: number[], limit = 8): string {
  if (ids.length === 0) return ''
  const shown = ids.slice(0, limit).map((id) => `#${id}`).join(', ')
  const extra = ids.length > limit ? ` (+${ids.length - limit} more)` : ''
  return `${shown}${extra}`
}

export function analyzeCollectionTokenCoverage(
  maxSupply: number,
  tokens: TokenCoverageRow[],
): TokenCoverageAnalysis {
  const byId = new Map<number, TokenCoverageRow>()
  for (const token of tokens) {
    if (token.token_id != null) byId.set(token.token_id, token)
  }

  const missingIds: number[] = []
  const incompleteIds: number[] = []

  for (let id = 1; id <= maxSupply; id++) {
    const row = byId.get(id)
    if (!row) {
      missingIds.push(id)
      continue
    }
    if (!row.name.trim() || !row.image_storage_path) {
      incompleteIds.push(id)
    }
  }

  return {
    missingIds,
    incompleteIds,
    readyCount: maxSupply - missingIds.length - incompleteIds.length,
  }
}

export function formatTokenCoverageError(
  maxSupply: number,
  analysis: TokenCoverageAnalysis,
  context: 'publish' | 'save',
): string | null {
  if (analysis.readyCount >= maxSupply) return null

  const parts: string[] = []
  if (analysis.missingIds.length > 0) {
    parts.push(`missing tokens ${formatTokenIdList(analysis.missingIds)}`)
  }
  if (analysis.incompleteIds.length > 0) {
    parts.push(`incomplete tokens ${formatTokenIdList(analysis.incompleteIds)} (need name + image)`)
  }

  const detail = parts.join('; ')
  if (context === 'publish') {
    return `Public mint requires artwork for all ${maxSupply} tokens (${analysis.readyCount} ready). ${detail}. Re-save the draft after fixing bulk upload, or lower max supply.`
  }

  return `Upload artwork for all ${maxSupply} tokens (${analysis.readyCount} ready). ${detail}.`
}

export function findSequentialImportGaps(sortedIds: number[]): number[] {
  if (sortedIds.length === 0) return []
  const highest = sortedIds[sortedIds.length - 1]!
  const idSet = new Set(sortedIds)
  const gaps: number[] = []
  for (let id = 1; id < highest; id++) {
    if (!idSet.has(id)) gaps.push(id)
  }
  return gaps
}

export function resolveBulkImportMaxSupplyFromIds(tokenIds: number[]): number {
  const unique = [...new Set(tokenIds.filter((id) => id > 0))].sort((a, b) => a - b)
  if (unique.length === 0) return 0
  return unique[unique.length - 1]!
}
