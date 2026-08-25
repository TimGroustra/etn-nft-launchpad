import type { CollectionToken } from '@/types/database'

export type Erc1155TypeAvailability = {
  tokenId: number
  name: string
  imagePath: string | null
  editionSize: number
  onChainCap: number
  onChainMinted: number
  remaining: number
  isListed: boolean
}

export function getEditionSizeFromDb(token: CollectionToken): number {
  return Math.max(1, token.edition_size ?? 1)
}

export function buildErc1155TypeAvailability(
  tokens: CollectionToken[],
  onChainCaps: Map<number, bigint>,
  onChainMinted: Map<number, bigint>,
): Erc1155TypeAvailability[] {
  return tokens
    .filter((token) => token.token_id != null)
    .sort((a, b) => (a.token_id ?? 0) - (b.token_id ?? 0))
    .map((token) => {
      const tokenId = token.token_id!
      const editionSize = getEditionSizeFromDb(token)
      const cap = Number(onChainCaps.get(tokenId) ?? 0n)
      const minted = Number(onChainMinted.get(tokenId) ?? 0n)
      const effectiveCap = cap > 0 ? cap : 0
      const remaining = effectiveCap > 0 ? Math.max(0, effectiveCap - minted) : 0

      return {
        tokenId,
        name: token.name?.trim() || `Type #${tokenId}`,
        imagePath: token.image_storage_path,
        editionSize,
        onChainCap: effectiveCap,
        onChainMinted: minted,
        remaining,
        isListed: effectiveCap > 0,
      }
    })
}

export function sumEditionRemaining(types: Erc1155TypeAvailability[]): number {
  return types.reduce((sum, type) => sum + type.remaining, 0)
}

export function sumEditionCaps(types: Erc1155TypeAvailability[]): number {
  return types.reduce((sum, type) => sum + type.onChainCap, 0)
}

export function getTotalEditionCopies(tokens: CollectionToken[]): number {
  return tokens.reduce((sum, token) => sum + getEditionSizeFromDb(token), 0)
}

export function formatErc1155SupplyLabel(tokens: CollectionToken[]): string {
  const typeCount = tokens.filter((t) => t.token_id != null).length
  const totalCopies = getTotalEditionCopies(tokens)
  return `${typeCount} types · ${totalCopies} total copies`
}
