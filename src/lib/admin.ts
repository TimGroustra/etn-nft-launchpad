import { TREASURY_ADDRESS } from '@/lib/blockchain'

function parseExtraAdminWallets(): string[] {
  const raw = import.meta.env.VITE_ADMIN_WALLETS?.trim()
  if (!raw) return []

  return raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((address) => address.startsWith('0x') && address.length === 42)
}

const ADMIN_WALLETS = new Set<string>([TREASURY_ADDRESS, ...parseExtraAdminWallets()])

export function getAdminWallets(): readonly string[] {
  return [...ADMIN_WALLETS]
}

export function isAdminWallet(address?: string | null): boolean {
  if (!address) return false
  return ADMIN_WALLETS.has(address.toLowerCase())
}
