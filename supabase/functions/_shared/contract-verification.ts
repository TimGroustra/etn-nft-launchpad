import { createPublicClient, encodeAbiParameters, http, parseAbi, parseAbiParameters } from 'https://esm.sh/viem@2.21.0'

const EXPLORER_API: Record<number, string> = {
  52014: 'https://blockexplorer.electroneum.com/api',
  5201420: 'https://testnet-blockexplorer.electroneum.com/api',
}

const EXPLORER_V2: Record<number, string> = {
  52014: 'https://blockexplorer.electroneum.com/api/v2',
  5201420: 'https://testnet-blockexplorer.electroneum.com/api/v2',
}

type CollectionVerificationKind = 'erc721' | 'erc721_v2' | 'erc1155'

const BUNDLE_FILES: Record<CollectionVerificationKind, string> = {
  erc721: 'editable-erc721-verification.json',
  erc721_v2: 'editable-erc721-v2-verification.json',
  erc1155: 'editable-erc1155-verification.json',
}

const SOURCE_PATHS: Record<CollectionVerificationKind, string> = {
  erc721: 'contracts/EditableERC721.sol',
  erc721_v2: 'contracts/EditableERC721V2.sol',
  erc1155: 'contracts/EditableERC1155.sol',
}

const BASE_CONTRACT_NAMES: Record<CollectionVerificationKind, string> = {
  erc721: 'EditableERC721',
  erc721_v2: 'EditableERC721V2',
  erc1155: 'EditableERC1155',
}

const EDITABLE_ERC721_SOURCE_PATH = SOURCE_PATHS.erc721

type VerificationBundle = {
  compilerVersion: string
  contractName: string
  standardJsonInput: unknown
}

const bundlePromises = new Map<CollectionVerificationKind, Promise<VerificationBundle>>()

function resolveCollectionVerificationKind(options?: {
  contractVersion?: number | null
  tokenStandard?: string | null
}): CollectionVerificationKind {
  const version = options?.contractVersion ?? 1
  if (version !== 2) return 'erc721'
  return options?.tokenStandard === 'erc1155' ? 'erc1155' : 'erc721_v2'
}

function getVerificationBundleUrl(kind: CollectionVerificationKind) {
  const file = BUNDLE_FILES[kind]
  const base =
    Deno.env.get('VERIFICATION_BUNDLE_URL') ??
    'https://www.etn-nft-launchpad.club'
  return `${base.replace(/\/$/, '')}/${file}`
}

async function loadVerificationBundle(
  kind: CollectionVerificationKind = 'erc721',
): Promise<VerificationBundle> {
  let promise = bundlePromises.get(kind)
  if (!promise) {
    promise = (async () => {
      const file = BUNDLE_FILES[kind]
      const candidates = [
        new URL(`./${file}`, import.meta.url),
        new URL(`../_shared/${file}`, import.meta.url),
      ]
      for (const candidate of candidates) {
        try {
          const bundled = await Deno.readTextFile(candidate)
          return JSON.parse(bundled) as VerificationBundle
        } catch {
          // try next path
        }
      }
      const res = await fetch(getVerificationBundleUrl(kind))
      if (!res.ok) throw new Error(`Failed to load verification bundle (${res.status})`)
      return (await res.json()) as VerificationBundle
    })()
    bundlePromises.set(kind, promise)
  }
  return promise
}

const CHAIN_RPC: Record<number, string> = {
  52014: 'https://rpc.ankr.com/electroneum',
  5201420: 'https://rpc.ankr.com/electroneum_testnet',
}

const COLLECTION_ERC721_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function owner() view returns (address)',
  'function clubToken() view returns (address)',
  'function WETN() view returns (address)',
  'function swapRouter() view returns (address)',
  'function burnConfig() view returns (uint96 mintBurnBps, bool burnOnMint, uint96 royaltyBurnBps)',
  'function maxSupply() view returns (uint256)',
  'function platformTreasury() view returns (address)',
  'function platformMintFeeBps() view returns (uint96)',
  'function electroGemsCollection() view returns (address)',
  'function clubWatchCollection() view returns (address)',
])

const COLLECTION_ERC1155_ABI = parseAbi([
  'function owner() view returns (address)',
  'function clubToken() view returns (address)',
  'function WETN() view returns (address)',
  'function swapRouter() view returns (address)',
  'function burnConfig() view returns (uint96 mintBurnBps, bool burnOnMint, uint96 royaltyBurnBps)',
  'function maxSupply() view returns (uint256)',
  'function platformTreasury() view returns (address)',
  'function platformMintFeeBps() view returns (uint96)',
  'function electroGemsCollection() view returns (address)',
  'function clubWatchCollection() view returns (address)',
])

const FACTORY_ABI = parseAbi(['function defaultRoyaltyBps() view returns (uint96)'])

type BurnConfigTuple = readonly [bigint, boolean, bigint]
type BurnConfigStruct = {
  mintBurnBps: bigint
  burnOnMint: boolean
  royaltyBurnBps: bigint
}

export function sanitizeSolidityContractName(collectionName: string): string {
  const parts = String(collectionName ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (/^\d+$/.test(part)) return part
      const cleaned = part.replace(/[^a-zA-Z0-9]/g, '')
      if (!cleaned) return ''
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    })
    .filter(Boolean)

  let name = parts.join('') || 'NFTCollection'
  if (/^\d/.test(name)) name = `Collection${name}`
  return name.slice(0, 64)
}

export function buildNamedVerificationBundle(
  bundle: VerificationBundle,
  collectionName: string,
  kind: CollectionVerificationKind = 'erc721',
): VerificationBundle {
  const contractName = sanitizeSolidityContractName(collectionName)
  const sourcePath = SOURCE_PATHS[kind]
  const baseContractName = BASE_CONTRACT_NAMES[kind]
  const input = JSON.parse(JSON.stringify(bundle.standardJsonInput)) as {
    sources: Record<string, { content: string }>
  }
  const source = input.sources?.[sourcePath]
  if (!source?.content) {
    throw new Error(`${baseContractName} source missing from verification bundle`)
  }

  input.sources[sourcePath] = {
    ...source,
    content: source.content.replace(
      new RegExp(`contract\\s+${baseContractName}\\b`),
      `contract ${contractName}`,
    ),
  }

  return {
    compilerVersion: bundle.compilerVersion,
    contractName: `${sourcePath}:${contractName}`,
    standardJsonInput: input,
  }
}

export async function getExplorerContractName(
  chainId: number,
  contractAddress: string,
): Promise<string | null> {
  const api = EXPLORER_V2[chainId]
  if (!api) return null
  try {
    const res = await fetch(`${api}/addresses/${contractAddress}`)
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.name === 'string' && data.name.length > 0 ? data.name : null
  } catch {
    return null
  }
}

function normalizeBurnConfig(burnConfig: BurnConfigStruct | BurnConfigTuple): BurnConfigStruct {
  if (Array.isArray(burnConfig)) {
    return {
      mintBurnBps: burnConfig[0],
      burnOnMint: burnConfig[1],
      royaltyBurnBps: burnConfig[2],
    }
  }
  return burnConfig
}

export async function readCollectionConstructorArgs(
  contractAddress: `0x${string}`,
  chainId: number,
  kind: CollectionVerificationKind,
  factoryAddress?: string | null,
  collectionName?: string | null,
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

  if (kind === 'erc1155') {
    const [owner, clubToken, wetn, swapRouter, burnConfig, maxSupply, platformTreasury, platformMintFeeBps, electroGemsCollection, clubWatchCollection] =
      await Promise.all([
        client.readContract({ address: contractAddress, abi: COLLECTION_ERC1155_ABI, functionName: 'owner' }),
        client.readContract({ address: contractAddress, abi: COLLECTION_ERC1155_ABI, functionName: 'clubToken' }),
        client.readContract({ address: contractAddress, abi: COLLECTION_ERC1155_ABI, functionName: 'WETN' }),
        client.readContract({ address: contractAddress, abi: COLLECTION_ERC1155_ABI, functionName: 'swapRouter' }),
        client.readContract({ address: contractAddress, abi: COLLECTION_ERC1155_ABI, functionName: 'burnConfig' }),
        client.readContract({ address: contractAddress, abi: COLLECTION_ERC1155_ABI, functionName: 'maxSupply' }),
        client.readContract({ address: contractAddress, abi: COLLECTION_ERC1155_ABI, functionName: 'platformTreasury' }),
        client.readContract({ address: contractAddress, abi: COLLECTION_ERC1155_ABI, functionName: 'platformMintFeeBps' }),
        client.readContract({ address: contractAddress, abi: COLLECTION_ERC1155_ABI, functionName: 'electroGemsCollection' }),
        client.readContract({ address: contractAddress, abi: COLLECTION_ERC1155_ABI, functionName: 'clubWatchCollection' }),
      ])

    return {
      kind,
      name: collectionName?.trim() || 'ERC1155Collection',
      uri: '',
      owner,
      clubToken,
      wetn,
      swapRouter,
      burnConfig: normalizeBurnConfig(burnConfig),
      maxSupply,
      defaultRoyaltyBps,
      platformTreasury,
      platformMintFeeBps,
      electroGemsCollection,
      clubWatchCollection,
    }
  }

  const [name, symbol, owner, clubToken, wetn, swapRouter, burnConfig, maxSupply, platformTreasury, platformMintFeeBps, electroGemsCollection, clubWatchCollection] =
    await Promise.all([
      client.readContract({ address: contractAddress, abi: COLLECTION_ERC721_ABI, functionName: 'name' }),
      client.readContract({ address: contractAddress, abi: COLLECTION_ERC721_ABI, functionName: 'symbol' }),
      client.readContract({ address: contractAddress, abi: COLLECTION_ERC721_ABI, functionName: 'owner' }),
      client.readContract({ address: contractAddress, abi: COLLECTION_ERC721_ABI, functionName: 'clubToken' }),
      client.readContract({ address: contractAddress, abi: COLLECTION_ERC721_ABI, functionName: 'WETN' }),
      client.readContract({ address: contractAddress, abi: COLLECTION_ERC721_ABI, functionName: 'swapRouter' }),
      client.readContract({ address: contractAddress, abi: COLLECTION_ERC721_ABI, functionName: 'burnConfig' }),
      client.readContract({ address: contractAddress, abi: COLLECTION_ERC721_ABI, functionName: 'maxSupply' }),
      client.readContract({ address: contractAddress, abi: COLLECTION_ERC721_ABI, functionName: 'platformTreasury' }),
      client.readContract({ address: contractAddress, abi: COLLECTION_ERC721_ABI, functionName: 'platformMintFeeBps' }),
      client.readContract({ address: contractAddress, abi: COLLECTION_ERC721_ABI, functionName: 'electroGemsCollection' }),
      client.readContract({ address: contractAddress, abi: COLLECTION_ERC721_ABI, functionName: 'clubWatchCollection' }),
    ])

  return {
    kind,
    name,
    symbol,
    owner,
    clubToken,
    wetn,
    swapRouter,
    burnConfig: normalizeBurnConfig(burnConfig),
    maxSupply,
    defaultRoyaltyBps,
    platformTreasury,
    platformMintFeeBps,
    electroGemsCollection,
    clubWatchCollection,
  }
}

export function encodeCollectionConstructorArgs(
  args: Awaited<ReturnType<typeof readCollectionConstructorArgs>>,
) {
  if (args.kind === 'erc1155') {
    const encoded = encodeAbiParameters(
      parseAbiParameters(
        'string, address, address, address, address, (uint96 mintBurnBps, bool burnOnMint, uint96 royaltyBurnBps), uint256, uint96, address, uint96, address, address',
      ),
      [
        args.uri ?? '',
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
        args.platformTreasury,
        args.platformMintFeeBps,
        args.electroGemsCollection,
        args.clubWatchCollection,
      ],
    )
    return encoded.startsWith('0x') ? encoded.slice(2) : encoded
  }

  const encoded = encodeAbiParameters(
    parseAbiParameters(
      'string, string, address, address, address, address, (uint96 mintBurnBps, bool burnOnMint, uint96 royaltyBurnBps), uint256, uint96, address, uint96, address, address',
    ),
    [
      args.name,
      args.symbol ?? '',
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
      args.platformTreasury,
      args.platformMintFeeBps,
      args.electroGemsCollection,
      args.clubWatchCollection,
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

export async function waitForVerificationResult(
  chainId: number,
  guid: string,
  maxAttempts = 12,
  delayMs = 5000,
): Promise<string> {
  const api = EXPLORER_API[chainId]
  if (!api) throw new Error('Unsupported chain')

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    const res = await fetch(`${api}?module=contract&action=checkverifystatus&guid=${encodeURIComponent(guid)}`)
    if (!res.ok) continue
    const data = await res.json()
    const result = String(data?.result ?? '')
    const lower = result.toLowerCase()
    if (lower.includes('pass')) return result
    if (lower.includes('fail')) throw new Error(result || 'Blockscout verification failed')
  }

  throw new Error('Blockscout verification is still pending. Check the explorer in a few minutes.')
}

export async function submitCollectionVerification(
  chainId: number,
  contractAddress: string,
  constructorArguments: string,
  collectionName: string,
  kind: CollectionVerificationKind = 'erc721',
) {
  const api = EXPLORER_API[chainId]
  if (!api) throw new Error('Unsupported chain')
  const bundle = await loadVerificationBundle(kind)
  const displayName = sanitizeSolidityContractName(collectionName)
  // Renaming the contract in source changes the metadata hash and breaks bytecode match.
  // ERC-1155 / V2 collections verify under the canonical implementation name.
  const namedBundle =
    kind === 'erc1155' || kind === 'erc721_v2' ? bundle : buildNamedVerificationBundle(bundle, collectionName, kind)

  const form = new URLSearchParams()
  form.set('module', 'contract')
  form.set('action', 'verifysourcecode')
  form.set('contractaddress', contractAddress)
  form.set('sourceCode', JSON.stringify(namedBundle.standardJsonInput))
  form.set('codeformat', 'solidity-standard-json-input')
  form.set('contractname', namedBundle.contractName)
  form.set('compilerversion', bundle.compilerVersion)
  form.set('optimizationUsed', '1')
  form.set('runs', '200')
  form.set('constructorArguments', constructorArguments)

  const res = await fetch(api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })

  const data = await res.json()
  const message = String(data?.result ?? data?.message ?? '')

  if (data?.status === '1') {
    const guid = message
    const finalMessage = await waitForVerificationResult(chainId, guid)
    return { status: 'submitted' as const, message: finalMessage, displayName }
  }

  const lower = message.toLowerCase()
  if (lower.includes('already verified') || lower.includes('already been verified')) {
    return { status: 'already_verified' as const, message, displayName }
  }

  throw new Error(message || 'Blockscout verification failed')
}

export async function verifyCollectionOnExplorer(
  chainId: number,
  contractAddress: string,
  factoryAddress?: string | null,
  options?: {
    contractVersion?: number | null
    tokenStandard?: string | null
    collectionName?: string | null
  },
) {
  const kind = resolveCollectionVerificationKind(options)
  const baseContractLabel = BASE_CONTRACT_NAMES[kind]
  const constructorArgs = await readCollectionConstructorArgs(
    contractAddress as `0x${string}`,
    chainId,
    kind,
    factoryAddress,
    options?.collectionName,
  )
  const encodedArgs = encodeCollectionConstructorArgs(constructorArgs)
  const desiredName =
    kind === 'erc1155'
      ? sanitizeSolidityContractName(options?.collectionName ?? constructorArgs.name)
      : sanitizeSolidityContractName(constructorArgs.name)
  const explorerName = await getExplorerContractName(chainId, contractAddress)
  const verified = await isContractVerified(chainId, contractAddress)

  if (verified) {
    const collectionLabel =
      kind === 'erc1155'
        ? options?.collectionName ?? baseContractLabel
        : constructorArgs.name
    return {
      status: 'already_verified' as const,
      displayName: explorerName ?? baseContractLabel,
      message: explorerName && explorerName !== desiredName
        ? `Contract is verified on the explorer as "${explorerName}". Your collection name is "${collectionLabel}".`
        : `Contract is verified on the explorer as ${baseContractLabel}. Your collection name is "${collectionLabel}".`,
    }
  }

  const result = await submitCollectionVerification(
    chainId,
    contractAddress,
    encodedArgs,
    kind === 'erc1155' ? (options?.collectionName ?? constructorArgs.name) : constructorArgs.name,
    kind,
  )

  const explorerNameAfter = await getExplorerContractName(chainId, contractAddress)
  if (result.status === 'submitted' || result.status === 'already_verified') {
    return {
      ...result,
      displayName: baseContractLabel,
      message:
        result.message ??
        `Contract verified on the explorer as ${baseContractLabel}. Your collection "${constructorArgs.name}" is identified by its on-chain name() and symbol().`,
      explorerName: explorerNameAfter ?? baseContractLabel,
    }
  }

  return result
}
