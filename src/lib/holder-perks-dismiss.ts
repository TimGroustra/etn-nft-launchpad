function storageKey(walletAddress: string) {
  return `holder-perks-dismissed:${walletAddress.toLowerCase()}`
}

export function isHolderPerksDismissed(walletAddress: string | undefined): boolean {
  if (!walletAddress) return false
  try {
    return sessionStorage.getItem(storageKey(walletAddress)) === '1'
  } catch {
    return false
  }
}

export function dismissHolderPerks(walletAddress: string) {
  try {
    sessionStorage.setItem(storageKey(walletAddress), '1')
  } catch {
    // ignore storage errors
  }
}

export function clearHolderPerksDismissed(walletAddress: string) {
  try {
    sessionStorage.removeItem(storageKey(walletAddress))
  } catch {
    // ignore storage errors
  }
}
