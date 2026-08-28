import { TREASURY_ADDRESS } from '@/lib/blockchain'

export function getAdminWallets(): readonly string[] {
  return [TREASURY_ADDRESS]
}

export function isAdminWallet(address?: string | null): boolean {
  if (!address) return false
  return address.toLowerCase() === TREASURY_ADDRESS
}
