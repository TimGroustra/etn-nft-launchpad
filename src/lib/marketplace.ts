import { getAddress, isAddress } from 'viem'

/** Shared anchor props so every ElectroSwap link opens in a new tab. */
export const ELECTROSWAP_EXTERNAL_LINK_PROPS = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const

function toChecksumAddress(contractAddress: string): string {
  return isAddress(contractAddress) ? getAddress(contractAddress) : contractAddress
}

/** ElectroSwap collection URLs require EIP-55 checksum addresses. */
export function getElectroSwapCollectionUrl(contractAddress: string): string {
  return `https://app.electroswap.io/nfts/collection/${toChecksumAddress(contractAddress)}`
}

/** ElectroSwap per-token asset pages also require checksum addresses. */
export function getElectroSwapAssetUrl(contractAddress: string, tokenId: string | number): string {
  return `https://app.electroswap.io/nfts/asset/${toChecksumAddress(contractAddress)}/${tokenId}`
}

export function getRaribleItemUrl(contractAddress: string, tokenId: string | number): string {
  const address = isAddress(contractAddress) ? contractAddress.toLowerCase() : contractAddress
  return `https://rarible.com/electroneum/items/${address}:${tokenId}`
}

export function getExplorerTokenInstanceUrl(contractAddress: string, tokenId: string | number): string {
  return `https://blockexplorer.electroneum.com/token/${toChecksumAddress(contractAddress)}/instance/${tokenId}`
}
