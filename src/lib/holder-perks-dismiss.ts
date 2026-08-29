function storageKey(walletAddress: string) {
  return `holder-perks-dismissed:${walletAddress.toLowerCase()}`
}

function readDismissed(walletAddress: string): boolean {
  return localStorage.getItem(storageKey(walletAddress)) === '1'
}

export function isHolderPerksDismissed(walletAddress: string | undefined): boolean {
  if (!walletAddress) return false
  try {
    return readDismissed(walletAddress)
  } catch {
    return false
  }
}

export function dismissHolderPerks(walletAddress: string) {
  try {
    localStorage.setItem(storageKey(walletAddress), '1')
  } catch {
    // ignore storage errors
  }
}

export function clearHolderPerksDismissed(walletAddress: string) {
  try {
    localStorage.removeItem(storageKey(walletAddress))
  } catch {
    // ignore storage errors
  }
}
