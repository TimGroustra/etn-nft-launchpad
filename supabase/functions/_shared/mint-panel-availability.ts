import { createPublicClient, http, parseAbi } from 'https://esm.sh/viem@2.21.0'

const CHAIN_RPC: Record<number, string> = {
  52014: 'https://rpc.electroneum.com',
  5201420: 'https://rpc.ankr.com/electroneum_testnet',
}

const ERC721_ABI = parseAbi([
  'function totalMinted() view returns (uint256)',
])

const ERC1155_ABI = parseAbi([
  'function editionCap(uint256 tokenId) view returns (uint256)',
  'function editionMinted(uint256 tokenId) view returns (uint256)',
])

const GEM_SHARDS_ABI = parseAbi([
  'function totalMinted() view returns (uint256)',
])

type CollectionRow = {
  id: string
  contract_address: string | null
  chain_id: number | null
  max_supply: number
  token_standard: 'erc721' | 'erc1155' | null
}

type SupabaseClient = ReturnType<typeof import('https://esm.sh/@supabase/supabase-js@2.45.0').createClient>

async function resolveGemShardsAddresses(
  supabase: SupabaseClient,
): Promise<{ mainnet: string | null; testnet: string | null }> {
  const { data } = await supabase
    .from('platform_config')
    .select('key, value')
    .in('key', ['gem_shards_mainnet', 'gem_shards_testnet'])

  const byKey = new Map((data ?? []).map((row) => [row.key, row.value]))
  return {
    mainnet: byKey.get('gem_shards_mainnet') ?? null,
    testnet: byKey.get('gem_shards_testnet') ?? null,
  }
}

function isGemShardsContract(
  contractAddress: string,
  chainId: number,
  gemShards: { mainnet: string | null; testnet: string | null },
): boolean {
  const configured = chainId === 5201420 ? gemShards.testnet : gemShards.mainnet
  if (!configured) return false
  return contractAddress.toLowerCase() === configured.toLowerCase()
}

export async function readCollectionFullyMintedOnChain(
  supabase: SupabaseClient,
  collection: CollectionRow,
): Promise<boolean> {
  if (!collection.contract_address) return false

  const chainId = collection.chain_id ?? 52014
  const rpcUrl = CHAIN_RPC[chainId]
  if (!rpcUrl) return false

  const client = createPublicClient({
    transport: http(rpcUrl),
  })
  const contractAddress = collection.contract_address as `0x${string}`

  if (collection.token_standard === 'erc1155') {
    const { data: tokens, error } = await supabase
      .from('collection_tokens')
      .select('token_id')
      .eq('collection_id', collection.id)
      .not('token_id', 'is', null)
    if (error) throw error
    if (!tokens?.length) return false

    let remaining = 0n
    for (const token of tokens) {
      const tokenId = BigInt(token.token_id!)
      const [cap, minted] = await Promise.all([
        client.readContract({
          address: contractAddress,
          abi: ERC1155_ABI,
          functionName: 'editionCap',
          args: [tokenId],
        }),
        client.readContract({
          address: contractAddress,
          abi: ERC1155_ABI,
          functionName: 'editionMinted',
          args: [tokenId],
        }),
      ])
      if (cap > 0n) {
        remaining += cap - minted
      }
    }
    return remaining <= 0n
  }

  const gemShards = await resolveGemShardsAddresses(supabase)
  const abi = isGemShardsContract(collection.contract_address, chainId, gemShards)
    ? GEM_SHARDS_ABI
    : ERC721_ABI

  const totalMinted = await client.readContract({
    address: contractAddress,
    abi,
    functionName: 'totalMinted',
  })

  return Number(totalMinted) >= collection.max_supply
}
