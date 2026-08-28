import { getAddress, isAddress } from 'viem'

/** Shared anchor props so every ElectroSwap link opens in a new tab. */
export const ELECTROSWAP_EXTERNAL_LINK_PROPS = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const

/** ElectroSwap collection URLs require EIP-55 checksum addresses. */
export function getElectroSwapCollectionUrl(contractAddress: string): string {
  const pathAddress = isAddress(contractAddress) ? getAddress(contractAddress) : contractAddress
  return `https://app.electroswap.io/nfts/collection/${pathAddress}`
}
