import type { Collection } from '@/types/database'

export type TokenStandard = 'erc721' | 'erc1155'
export type ContractVersion = 1 | 2

export function isLegacyCollection(collection: Pick<Collection, 'contract_version'>): boolean {
  return (collection.contract_version ?? 1) === 1
}

export function getCollectionTokenStandard(collection: Pick<Collection, 'token_standard'>): TokenStandard {
  return collection.token_standard === 'erc1155' ? 'erc1155' : 'erc721'
}

export type FactoryDeployFunction =
  | 'deployCollection'
  | 'deployCollectionERC721'
  | 'deployCollectionERC1155'

export function getFactoryDeployFunction(
  collection: Pick<Collection, 'contract_version' | 'token_standard'>,
): FactoryDeployFunction {
  if (isLegacyCollection(collection)) return 'deployCollection'
  return getCollectionTokenStandard(collection) === 'erc1155'
    ? 'deployCollectionERC1155'
    : 'deployCollectionERC721'
}

export function usesFactoryV2(collection: Pick<Collection, 'contract_version'>): boolean {
  return !isLegacyCollection(collection)
}

export function formatTokenStandardLabel(standard: TokenStandard): string {
  return standard === 'erc1155' ? 'ERC-1155 (editioned)' : 'ERC-721'
}

export const DEFAULT_CONTRACT_VERSION: ContractVersion = 1
export const DEFAULT_TOKEN_STANDARD: TokenStandard = 'erc721'
