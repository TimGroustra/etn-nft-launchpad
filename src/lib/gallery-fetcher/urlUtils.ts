import { ethers } from 'ethers'

const PUBLIC_IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://nftstorage.link/ipfs/',
  'https://dweb.link/ipfs/',
] as const

/** Extract `CID/path` from ipfs:// or https gateway URLs. */
export function extractIpfsPath(url: string): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (trimmed.startsWith('ipfs://')) {
    return trimmed.replace(/^ipfs:\/\/(ipfs\/)?/, '')
  }
  try {
    const parsed = new URL(trimmed)
    const match = parsed.pathname.match(/\/ipfs\/(.+)$/i)
    if (match) return match[1]
  } catch {
    // not a URL
  }
  return null
}

/** Ordered fetch URLs — same-origin /ipfs proxy first to avoid browser CORS blocks. */
export function getGatewayCandidates(url: string): string[] {
  if (!url) return []
  const trimmed = url.trim()

  if (trimmed.startsWith('data:')) return [trimmed]

  const ipfsPath = extractIpfsPath(trimmed)
  if (!ipfsPath) {
    return [trimmed]
  }

  const candidates: string[] = []
  if (typeof window !== 'undefined') {
    candidates.push(`${window.location.origin}/ipfs/${ipfsPath}`)
  }
  for (const gateway of PUBLIC_IPFS_GATEWAYS) {
    candidates.push(`${gateway}${ipfsPath}`)
  }
  return candidates
}

export function normalizeUrl(url: string): string {
  return getGatewayCandidates(url)[0] ?? url
}

export function hex64(id: number | string): string {
  const bn = ethers.toBigInt(id.toString())
  let hex = bn.toString(16).replace(/^0x/, '')
  hex = hex.padStart(64, '0').toLowerCase()
  return hex
}
