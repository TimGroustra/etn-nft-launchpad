import { Contract, JsonRpcProvider } from 'https://esm.sh/ethers@6.15.0'

const ELECTRO_GEMS_ADDRESS =
  Deno.env.get('ELECTROGEMS_NFT_ADDRESS') ?? '0xcff0d88Ed5311bAB09178b6ec19A464100880984'
const RPC_URL = Deno.env.get('ETN_RPC_URL') ?? 'https://rpc.electroneum.com'
const BLOCKSCOUT_API = 'https://blockexplorer.electroneum.com/api/v2'
const RPC_TIMEOUT_MS = 12_000

const GEM_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
]

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeoutId: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), RPC_TIMEOUT_MS)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

async function fetchOwnedFromBlockscout(walletAddress: string): Promise<string[]> {
  const res = await withTimeout(
    fetch(`${BLOCKSCOUT_API}/addresses/${walletAddress}/tokens?type=ERC-721`),
    'Blockscout gem lookup',
  )
  if (!res.ok) return []
  const data = (await res.json()) as {
    items?: Array<{ token?: { address?: string; id?: string } }>
  }
  return (data.items ?? [])
    .filter((item) => item.token?.address?.toLowerCase() === ELECTRO_GEMS_ADDRESS.toLowerCase())
    .map((item) => item.token?.id)
    .filter((id): id is string => Boolean(id))
    .slice(0, 20)
}

export async function getOwnedGemTokens(walletAddress: string): Promise<string[]> {
  const wallet = walletAddress.toLowerCase()
  try {
    const provider = new JsonRpcProvider(RPC_URL, undefined, { staticNetwork: true })
    const contract = new Contract(ELECTRO_GEMS_ADDRESS, GEM_ABI, provider)
    const balance = Number(await withTimeout(contract.balanceOf(wallet), 'Gem balance lookup'))
    if (balance === 0) return []

    const tokens: string[] = []
    const limit = Math.min(balance, 20)
    for (let i = 0; i < limit; i++) {
      try {
        const tokenId = await withTimeout(contract.tokenOfOwnerByIndex(wallet, i), 'Gem token lookup')
        tokens.push(String(tokenId))
      } catch {
        break
      }
    }
    if (tokens.length > 0) return tokens
  } catch (error) {
    console.warn('[gem-ownership] RPC lookup failed, falling back to Blockscout:', error)
  }

  return fetchOwnedFromBlockscout(wallet)
}
