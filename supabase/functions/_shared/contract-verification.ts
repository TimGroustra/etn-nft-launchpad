import { createPublicClient, encodeAbiParameters, http, parseAbi, parseAbiParameters } from 'https://esm.sh/viem@2.21.0'

const EXPLORER_API: Record<number, string> = {
  52014: 'https://blockexplorer.electroneum.com/api',
  5201420: 'https://testnet-blockexplorer.electroneum.com/api',
}

const CHAIN_RPC: Record<number, string> = {
  52014: 'https://rpc.ankr.com/electroneum',
  5201420: 'https://rpc.ankr.com/electroneum_testnet',
}

const COLLECTION_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function owner() view returns (address)',
  'function clubToken() view returns (address)',
  'function WETN() view returns (address)',
  'function swapRouter() view returns (address)',
  'function burnConfig() view returns (uint96 mintBurnBps, bool burnOnMint, uint96 royaltyBurnBps)',
  'function maxSupply() view returns (uint256)',
])

const FACTORY_ABI = parseAbi(['function defaultRoyaltyBps() view returns (uint96)'])

type VerificationBundle = {
  compilerVersion: string
  contractName: string
  standardJsonInput: unknown
}

let bundlePromise: Promise<VerificationBundle> | null = null

function getVerificationBundleUrl() {
  return (
    Deno.env.get('VERIFICATION_BUNDLE_URL') ??
    'https://etn-nft-launchpad.vercel.app/editable-erc721-verification.json'
  )
}

async function loadVerificationBundle(): Promise<VerificationBundle> {
  if (!bundlePromise) {
    bundlePromise = fetch(getVerificationBundleUrl()).then(async (res) => {
      if (!res.ok) throw new Error(`Failed to load verification bundle (${res.status})`)
      return (await res.json()) as VerificationBundle
    })
  }
  return bundlePromise
}

export async function readCollectionConstructorArgs(
  contractAddress: `0x${string}`,
  chainId: number,
  factoryAddress?: string | null,
) {
  const rpc = CHAIN_RPC[chainId]
  if (!rpc) throw new Error('Unsupported chain')

  const client = createPublicClient({
    chain: {
      id: chainId,
      name: chainId === 5201420 ? 'Electroneum Testnet' : 'Electroneum',
      nativeCurrency: { name: 'ETN', symbol: 'ETN', decimals: 18 },
      rpcUrls: { default: { http: [rpc] } },
    },
    transport: http(rpc),
  })

  const [name, symbol, owner, clubToken, wetn, swapRouter, burnConfig, maxSupply] = await Promise.all([
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'name' }),
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'symbol' }),
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'owner' }),
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'clubToken' }),
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'WETN' }),
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'swapRouter' }),
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'burnConfig' }),
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'maxSupply' }),
  ])

  let defaultRoyaltyBps = 500n
  if (factoryAddress) {
    try {
      defaultRoyaltyBps = await client.readContract({
        address: factoryAddress as `0x${string}`,
        abi: FACTORY_ABI,
        functionName: 'defaultRoyaltyBps',
      })
    } catch {
      // keep default
    }
  }

  return {
    name,
    symbol,
    owner,
    clubToken,
    wetn,
    swapRouter,
    burnConfig,
    maxSupply,
    defaultRoyaltyBps,
  }
}

export function encodeCollectionConstructorArgs(args: Awaited<ReturnType<typeof readCollectionConstructorArgs>>) {
  const encoded = encodeAbiParameters(
    parseAbiParameters(
      'string, string, address, address, address, address, (uint96 mintBurnBps, bool burnOnMint, uint96 royaltyBurnBps), uint256, uint96',
    ),
    [
      args.name,
      args.symbol,
      args.owner,
      args.clubToken,
      args.wetn,
      args.swapRouter,
      {
        mintBurnBps: args.burnConfig.mintBurnBps,
        burnOnMint: args.burnConfig.burnOnMint,
        royaltyBurnBps: args.burnConfig.royaltyBurnBps,
      },
      args.maxSupply,
      args.defaultRoyaltyBps,
    ],
  )
  return encoded.startsWith('0x') ? encoded.slice(2) : encoded
}

export async function isContractVerified(chainId: number, contractAddress: string): Promise<boolean> {
  const api = EXPLORER_API[chainId]
  if (!api) return false
  const url = `${api}?module=contract&action=getsourcecode&address=${contractAddress}`
  const res = await fetch(url)
  if (!res.ok) return false
  const data = await res.json()
  const source = data?.result?.[0]?.SourceCode
  return typeof source === 'string' && source.length > 0
}

export async function submitCollectionVerification(
  chainId: number,
  contractAddress: string,
  constructorArguments: string,
) {
  const api = EXPLORER_API[chainId]
  if (!api) throw new Error('Unsupported chain')
  const bundle = await loadVerificationBundle()

  const form = new URLSearchParams()
  form.set('module', 'contract')
  form.set('action', 'verifysourcecode')
  form.set('contractaddress', contractAddress)
  form.set('sourceCode', JSON.stringify(bundle.standardJsonInput))
  form.set('codeformat', 'solidity-standard-json-input')
  form.set('contractname', bundle.contractName)
  form.set('compilerversion', bundle.compilerVersion)
  form.set('optimizationUsed', '1')
  form.set('runs', '200')
  form.set('constructorArguements', constructorArguments)

  const res = await fetch(api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })

  const data = await res.json()
  const message = String(data?.result ?? data?.message ?? '')

  if (data?.status === '1') {
    return { status: 'submitted' as const, message }
  }

  const lower = message.toLowerCase()
  if (lower.includes('already verified') || lower.includes('already been verified')) {
    return { status: 'already_verified' as const, message }
  }

  throw new Error(message || 'Blockscout verification failed')
}
