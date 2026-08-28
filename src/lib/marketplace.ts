import { getAddress, isAddress } from 'viem'

/** ElectroSwap collection URLs require EIP-55 checksum addresses. */
export function getElectroSwapCollectionUrl(contractAddress: string): string {
  const pathAddress = isAddress(contractAddress) ? getAddress(contractAddress) : contractAddress
  return `https://app.electroswap.io/nfts/collection/${pathAddress}`
}
