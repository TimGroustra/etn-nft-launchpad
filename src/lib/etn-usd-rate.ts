const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=electroneum&vs_currencies=usd'
const COINCAP_URL = 'https://api.coincap.io/v2/assets/electroneum'

export async function fetchEtnUsdRate(): Promise<number> {
  try {
    const response = await fetch(COINGECKO_URL)
    if (!response.ok) throw new Error('CoinGecko unavailable')
    const data = await response.json()
    const usd = Number(data?.electroneum?.usd)
    if (!Number.isFinite(usd) || usd <= 0) throw new Error('Invalid CoinGecko rate')
    return usd
  } catch {
    const response = await fetch(COINCAP_URL)
    if (!response.ok) throw new Error('Rate unavailable')
    const data = await response.json()
    const usd = Number(data?.data?.priceUsd)
    if (!Number.isFinite(usd) || usd <= 0) throw new Error('Invalid CoinCap rate')
    return usd
  }
}

export function etnToUsd(etn: number, usdPerEtn: number): number {
  return etn * usdPerEtn
}

export function usdToEtn(usd: number, usdPerEtn: number): number {
  if (usdPerEtn <= 0) return 0
  return usd / usdPerEtn
}

/** Format for display — adapts precision for very small ETN prices. */
export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return '—'
  if (amount >= 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }
  if (amount >= 0.01) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(amount)
}

export function formatEtnFromUsdInput(usd: number, usdPerEtn: number, minEtn = 0): string {
  const etn = usdToEtn(usd, usdPerEtn)
  if (!Number.isFinite(etn) || etn <= 0) return ''
  const rounded = Math.round(etn * 10000) / 10000
  return String(Math.max(minEtn, rounded))
}
