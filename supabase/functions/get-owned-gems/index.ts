import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { JsonRpcProvider, Contract } from 'https://esm.sh/ethers@6.15.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/utils.ts'

const ELECTRO_GEMS_ADDRESS =
  Deno.env.get('ELECTROGEMS_NFT_ADDRESS') ?? '0xcff0d88Ed5311bAB09178b6ec19A464100880984'
const RPC_URL = Deno.env.get('ETN_RPC_URL') ?? 'https://rpc.ankr.com/electroneum'
const BLOCKSCOUT_API = 'https://blockexplorer.electroneum.com/api/v2'

const ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
]

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

async function fetchOwnedFromChain(walletAddress: string): Promise<string[]> {
  const provider = new JsonRpcProvider(RPC_URL, undefined, { staticNetwork: true })
  const contract = new Contract(ELECTRO_GEMS_ADDRESS, ABI, provider)
  const balance = Number(await contract.balanceOf(walletAddress))
  if (balance === 0) return []

  const ownedTokens: string[] = []
  const limit = Math.min(balance, 20)
  for (let i = 0; i < limit; i++) {
    try {
      ownedTokens.push((await contract.tokenOfOwnerByIndex(walletAddress, i)).toString())
    } catch {
      break
    }
  }

  if (ownedTokens.length > 0) return ownedTokens

  const res = await fetch(
    `${BLOCKSCOUT_API}/addresses/${walletAddress}/tokens?type=ERC-721`,
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { walletAddress } = await req.json()
    if (!walletAddress) {
      return new Response(JSON.stringify({ error: 'Missing walletAddress' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const ownedTokens = await fetchOwnedFromChain(walletAddress)

    const now = new Date().toISOString()
    const { data: locks } = await supabase
      .from('panel_locks')
      .select('locking_gem_token_id')
      .gt('locked_until', now)

    const usedTokens = new Set((locks ?? []).map((l) => l.locking_gem_token_id).filter(Boolean))
    const availableTokens = ownedTokens.filter((id) => !usedTokens.has(id))

    return new Response(JSON.stringify({ ownedTokens, availableTokens }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[get-owned-gems] Error:', e)
    return new Response(
      JSON.stringify({ error: 'Failed to retrieve gems', details: String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
