import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function shortenAddress(address: string, chars = 4) {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

export function normalizeContractAddress(address: string): string {
  return address.toLowerCase().trim()
}

export function parseClubAmount(amount: string): bigint {
  const [whole, fraction = ''] = amount.split('.')
  const padded = (fraction + '0'.repeat(18)).slice(0, 18)
  return BigInt(whole + padded)
}

export function formatClubAmount(amount: bigint): string {
  const str = amount.toString().padStart(19, '0')
  const whole = str.slice(0, -18) || '0'
  const fraction = str.slice(-18).replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}
