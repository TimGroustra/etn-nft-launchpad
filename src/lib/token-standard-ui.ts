import type { DraftToken } from '@/lib/create-collection-validation'

export type TokenStandard = 'erc721' | 'erc1155'

export function isErc1155(standard: TokenStandard): boolean {
  return standard === 'erc1155'
}

export function supportsRandomPublicMint(standard: TokenStandard): boolean {
  return !isErc1155(standard)
}

export function getSupplyFieldLabel(standard: TokenStandard): string {
  return isErc1155(standard) ? 'Number of types' : 'Max supply'
}

export function getSupplyFieldHint(standard: TokenStandard): string {
  return isErc1155(standard)
    ? 'How many distinct token IDs (artworks) your collection can have. You set how many copies exist per type on the Artwork step.'
    : 'Total number of unique NFTs that can ever exist in this collection.'
}

export function getTypeRowLabel(standard: TokenStandard, tokenNum: number): string {
  return isErc1155(standard) ? `Type #${tokenNum}` : `Token #${tokenNum}`
}

export function sumEditionSizes(tokens: DraftToken[]): number {
  return tokens.reduce((sum, token) => sum + Math.max(1, token.editionSize ?? 1), 0)
}

export function countCompleteEditionSizes(tokens: DraftToken[], isComplete: (token: DraftToken) => boolean): number {
  return tokens.reduce((sum, token) => (isComplete(token) ? sum + Math.max(1, token.editionSize ?? 1) : sum), 0)
}
