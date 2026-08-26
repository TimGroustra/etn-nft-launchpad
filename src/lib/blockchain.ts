import type { CustomRpcUrlMap } from '@reown/appkit-common'
import { resolveRequiredPublishFeeWei } from '@/lib/publish-fee-resolution'
import { decodeEventLog, defineChain, getAddress, parseEventLogs, type Log, type PublicClient, type TransactionReceipt } from 'viem'

export const electroneum = defineChain({
  id: 52014,
  name: 'Electroneum Mainnet',
  nativeCurrency: { name: 'Electroneum', symbol: 'ETN', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.electroneum.com', 'https://rpc.ankr.com/electroneum'] },
    public: { http: ['https://rpc.electroneum.com', 'https://rpc.ankr.com/electroneum'] },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://blockexplorer.electroneum.com' },
  },
})

export const electroneumTestnet = defineChain({
  id: 5201420,
  name: 'Electroneum Testnet',
  nativeCurrency: { name: 'Electroneum', symbol: 'ETN', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.ankr.com/electroneum_testnet'] },
    public: { http: ['https://rpc.ankr.com/electroneum_testnet'] },
  },
  blockExplorers: {
    default: { name: 'Testnet Explorer', url: 'https://testnet-blockexplorer.electroneum.com' },
  },
})

export type NetworkKey = 'mainnet' | 'testnet'

export const SUPPORTED_CHAINS = [electroneum, electroneumTestnet] as const

function toCustomRpcUrls(chain: (typeof SUPPORTED_CHAINS)[number]): CustomRpcUrlMap[keyof CustomRpcUrlMap] {
  return chain.rpcUrls.default.http.map((url) => ({ url }))
}

/** Reown AppKit balance + wagmi transports for Electroneum RPCs (not in WalletConnect defaults). */
export const CUSTOM_RPC_URLS: CustomRpcUrlMap = {
  [`eip155:${electroneum.id}`]: toCustomRpcUrls(electroneum),
  [`eip155:${electroneumTestnet.id}`]: toCustomRpcUrls(electroneumTestnet),
}

export function getChainKey(chainId: number): NetworkKey {
  return chainId === electroneumTestnet.id ? 'testnet' : 'mainnet'
}

export function getChainByKey(key: NetworkKey) {
  return key === 'testnet' ? electroneumTestnet : electroneum
}

export function getChainId(key: NetworkKey): number {
  return getChainByKey(key).id
}

export function getExplorerContractUrl(chainId: number, contractAddress: string): string {
  const chain = chainId === electroneumTestnet.id ? electroneumTestnet : electroneum
  return `${chain.blockExplorers.default.url}/address/${contractAddress}`
}

export function getExplorerNftUrl(chainId: number, contractAddress: string, tokenId: number | string): string {
  const chain = chainId === electroneumTestnet.id ? electroneumTestnet : electroneum
  return `${chain.blockExplorers.default.url}/token/${contractAddress}/instance/${tokenId}`
}

export const CLUB_TOKEN_ADDRESS = '0xC9FC4AB00911793D99b5c7Bd01f01203C21D4131'
export const WETN_ADDRESS = '0x138DAFbDA0CCB3d8E39C19edb0510Fc31b7C1c77'
/** ElectroSwap SwapRouter02 (V3 exactInput). Do not use the V3 Liquidity Locker (0xfdB0…). */
export const ELECTROSWAP_V3_ROUTER = '0x5A3AB7e9f405250B36e7e0a4654c1052EADC1F07' as const
export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as const

/** Factory treasury — only this wallet may switch the app to testnet. */
export const TREASURY_ADDRESS = (
  import.meta.env.VITE_TREASURY_ADDRESS ?? '0x126aa663BdeDd6Ae477fd28a7d0b624b8109D15d'
).toLowerCase() as `0x${string}`

export function isTreasuryWallet(address?: string | null): boolean {
  return Boolean(address && address.toLowerCase() === TREASURY_ADDRESS)
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

export function getFactoryAddress(network: NetworkKey): `0x${string}` {
  if (network === 'testnet') {
    return (import.meta.env.VITE_FACTORY_ADDRESS_TESTNET ?? ZERO_ADDRESS) as `0x${string}`
  }
  return (import.meta.env.VITE_FACTORY_ADDRESS_MAINNET ?? import.meta.env.VITE_FACTORY_ADDRESS ?? ZERO_ADDRESS) as `0x${string}`
}

export function getFactoryV2Address(network: NetworkKey, tokenStandard: 'erc721' | 'erc1155' = 'erc721'): `0x${string}` {
  if (network === 'testnet') {
    if (tokenStandard === 'erc1155') {
      return (import.meta.env.VITE_FACTORY_ADDRESS_V2_ERC1155_TESTNET ?? ZERO_ADDRESS) as `0x${string}`
    }
    return (
      import.meta.env.VITE_FACTORY_ADDRESS_V2_ERC721_TESTNET ??
      import.meta.env.VITE_FACTORY_ADDRESS_V2_TESTNET ??
      ZERO_ADDRESS
    ) as `0x${string}`
  }
  if (tokenStandard === 'erc1155') {
    return (import.meta.env.VITE_FACTORY_ADDRESS_V2_ERC1155_MAINNET ?? ZERO_ADDRESS) as `0x${string}`
  }
  return (
    import.meta.env.VITE_FACTORY_ADDRESS_V2_ERC721_MAINNET ??
    import.meta.env.VITE_FACTORY_ADDRESS_V2_MAINNET ??
    ZERO_ADDRESS
  ) as `0x${string}`
}

const DEFAULT_PUBLISH_FEE_WEI: Record<NetworkKey, bigint> = {
  testnet: 1_000_000_000_000_000_000n, // 1 ETN
  mainnet: 1_000_000_000_000_000_000_000n, // 1000 ETN
}

export function getPublishFeeWei(network: NetworkKey): bigint {
  const envKey =
    network === 'testnet' ? import.meta.env.VITE_PUBLISH_FEE_WEI_TESTNET : import.meta.env.VITE_PUBLISH_FEE_WEI_MAINNET
  const fallback = import.meta.env.VITE_PUBLISH_FEE_WEI
  const raw = envKey ?? fallback
  return raw ? BigInt(raw) : DEFAULT_PUBLISH_FEE_WEI[network]
}

export function formatPublishFeeEtn(network: NetworkKey): string {
  const wei = getPublishFeeWei(network)
  const etn = Number(wei / 1_000_000_000_000_000_000n)
  return etn.toLocaleString()
}

/** @deprecated Use getFactoryAddress(network) */
export const FACTORY_ADDRESS = getFactoryAddress('mainnet')
/** @deprecated Use getPublishFeeWei(network) */
export const PUBLISH_FEE_WEI = getPublishFeeWei('mainnet')

export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const DEFAULT_FACTORY_ROYALTY_BPS = 500

const FACTORY_BURN_CONFIG_INPUT = {
  name: 'burnConfig',
  type: 'tuple',
  components: [
    { name: 'mintBurnBps', type: 'uint96' },
    { name: 'burnOnMint', type: 'bool' },
    { name: 'royaltyBurnBps', type: 'uint96' },
  ],
} as const

export const FACTORY_V2_ABI = [
  {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      FACTORY_BURN_CONFIG_INPUT,
      { name: 'maxSupply', type: 'uint256' },
    ],
    name: 'deployCollectionERC721',
    outputs: [{ name: 'collection', type: 'address' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      FACTORY_BURN_CONFIG_INPUT,
      { name: 'maxSupply', type: 'uint256' },
    ],
    name: 'deployCollectionERC1155',
    outputs: [{ name: 'collection', type: 'address' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'publishFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'payer', type: 'address' },
      { name: 'maxSupply', type: 'uint256' },
    ],
    name: 'requiredPublishFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'creator', type: 'address' },
      { indexed: true, name: 'collection', type: 'address' },
      { indexed: false, name: 'name', type: 'string' },
      { indexed: false, name: 'symbol', type: 'string' },
      { indexed: false, name: 'tokenStandard', type: 'uint8' },
      { indexed: false, name: 'maxSupply', type: 'uint256' },
    ],
    name: 'CollectionDeployedV2',
    type: 'event',
  },
] as const

export const FACTORY_ABI = [
  {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      {
        name: 'burnConfig',
        type: 'tuple',
        components: [
          { name: 'mintBurnBps', type: 'uint96' },
          { name: 'burnOnMint', type: 'bool' },
          { name: 'royaltyBurnBps', type: 'uint96' },
        ],
      },
      { name: 'maxSupply', type: 'uint256' },
    ],
    name: 'deployCollection',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'publishFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'payer', type: 'address' },
      { name: 'maxSupply', type: 'uint256' },
    ],
    name: 'requiredPublishFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'maxSupply', type: 'uint256' }],
    name: 'tieredPublishFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'defaultRoyaltyBps',
    outputs: [{ name: '', type: 'uint96' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'clubToken',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'wetn',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'swapRouter',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'treasury',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'newFee', type: 'uint256' }],
    name: 'setPublishFee',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'newTreasury', type: 'address' }],
    name: 'setTreasury',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'newClubToken', type: 'address' }],
    name: 'setClubToken',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'newWetn', type: 'address' }],
    name: 'setWetn',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'newSwapRouter', type: 'address' }],
    name: 'setSwapRouter',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'newBps', type: 'uint96' }],
    name: 'setDefaultRoyaltyBps',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'clubToken_', type: 'address' },
      { name: 'wetn_', type: 'address' },
      { name: 'swapRouter_', type: 'address' },
      { name: 'defaultRoyaltyBps_', type: 'uint96' },
    ],
    name: 'setDeploymentConfig',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'creator', type: 'address' },
      { indexed: true, name: 'collection', type: 'address' },
      { indexed: false, name: 'name', type: 'string' },
      { indexed: false, name: 'symbol', type: 'string' },
      {
        indexed: false,
        name: 'burnConfig',
        type: 'tuple',
        components: [
          { name: 'mintBurnBps', type: 'uint96' },
          { name: 'burnOnMint', type: 'bool' },
          { name: 'royaltyBurnBps', type: 'uint96' },
        ],
      },
      { indexed: false, name: 'maxSupply', type: 'uint256' },
    ],
    name: 'CollectionDeployed',
    type: 'event',
  },
] as const

export const LAUNCHPAD_MINTER_ABI = [
  {
    inputs: [
      { name: 'collection', type: 'address' },
      { name: 'buyer', type: 'address' },
      { name: 'mintCount', type: 'uint256' },
    ],
    name: 'requiredMintPayment',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'collection', type: 'address' },
      { name: 'mintCount', type: 'uint256' },
    ],
    name: 'mintERC721',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'collection', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'mintEdition',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
] as const

export const NFT_ABI = [
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'withdrawERC20',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'uri', type: 'string' },
    ],
    name: 'ownerMint',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'recipients', type: 'address[]' },
      { name: 'uris', type: 'string[]' },
    ],
    name: 'batchMint',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'random_', type: 'bool' }],
    name: 'setRandomPublicMint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'randomPublicMint',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: true, name: 'metadataIndex', type: 'uint256' },
    ],
    name: 'PublicMintAssigned',
    type: 'event',
  },
  {
    inputs: [{ name: 'mintCount', type: 'uint256' }],
    name: 'mint',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'mintPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'platformMintFeeBps',
    outputs: [{ name: '', type: 'uint96' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'minter', type: 'address' },
      { name: 'mintCount', type: 'uint256' },
    ],
    name: 'requiredMintPayment',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'mintableCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'isMintable',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'mintable_', type: 'bool' }],
    name: 'setMintable',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'price', type: 'uint256' }],
    name: 'setMintPrice',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'maxMintPerWallet_', type: 'uint256' }],
    name: 'setMaxMintPerWallet',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'maxMintPerWallet',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'uri', type: 'string' },
    ],
    name: 'setTokenURI',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tokenIds', type: 'uint256[]' },
      { name: 'uris', type: 'string[]' },
    ],
    name: 'batchSetTokenURI',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'baseURI_', type: 'string' }],
    name: 'setBaseURI',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'receiver', type: 'address' },
      { name: 'feeNumerator', type: 'uint96' },
    ],
    name: 'setDefaultRoyalty',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'salePrice', type: 'uint256' },
    ],
    name: 'royaltyInfo',
    outputs: [
      { name: 'receiver', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'burnConfig',
    outputs: [
      { name: 'mintBurnBps', type: 'uint96' },
      { name: 'burnOnMint', type: 'bool' },
      { name: 'royaltyBurnBps', type: 'uint96' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        name: 'config_',
        type: 'tuple',
        components: [
          { name: 'mintBurnBps', type: 'uint96' },
          { name: 'burnOnMint', type: 'bool' },
          { name: 'royaltyBurnBps', type: 'uint96' },
        ],
      },
    ],
    name: 'setBurnConfig',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalMinted',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'feeReceiver',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'MAX_SUPPLY',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'MAX_MINT_PER_WALLET',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'PRICE',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const ERC1155_BATCH_MINT = {
  inputs: [
    { name: 'to', type: 'address' },
    { name: 'tokenIds', type: 'uint256[]' },
    { name: 'amounts', type: 'uint256[]' },
    { name: 'uris', type: 'string[]' },
  ],
  name: 'batchMint',
  outputs: [{ name: '', type: 'uint256[]' }],
  stateMutability: 'nonpayable',
  type: 'function',
} as const

const ERC1155_EDITION_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'editionCap',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'editionMinted',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'supportsMintEdition',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'mintEdition',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'cap', type: 'uint256' },
    ],
    name: 'setEditionCap',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'tokenUri', type: 'string' },
    ],
    name: 'ownerMint',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

export function getCollectionContractAbi(collection: {
  token_standard?: 'erc721' | 'erc1155' | null
  contract_version?: number | null
}) {
  const isErc1155 = (collection.contract_version ?? 1) !== 1 && collection.token_standard === 'erc1155'
  if (!isErc1155) return NFT_ABI
  return [
    ...NFT_ABI.filter((entry) => !('name' in entry && (entry.name === 'batchMint' || entry.name === 'ownerMint'))),
    ERC1155_BATCH_MINT,
    ...ERC1155_EDITION_ABI,
  ]
}

export type ParsedMintAssignment = {
  onChainTokenId: number
  metadataIndex: number
}

/** Resolve on-chain token IDs and metadata indices from a public mint transaction. */
export function parsePublicMintReceipt(
  receipt: TransactionReceipt,
  contractAddress: string,
  mintedBefore: number,
  quantity: number,
): ParsedMintAssignment[] {
  const normalized = contractAddress.toLowerCase()
  const events = parseEventLogs({
    abi: NFT_ABI,
    logs: receipt.logs.filter((log) => log.address.toLowerCase() === normalized),
    eventName: 'PublicMintAssigned',
  })

  if (events.length > 0) {
    return events.map((event) => ({
      onChainTokenId: Number(event.args.tokenId),
      metadataIndex: Number(event.args.metadataIndex),
    }))
  }

  return Array.from({ length: quantity }, (_, index) => {
    const onChainTokenId = mintedBefore + index + 1
    return { onChainTokenId, metadataIndex: onChainTokenId }
  })
}

/** Parse the factory CollectionDeployed event — never use generic log topic heuristics. */
export async function readRequiredPublishFeeWei(
  client: PublicClient,
  factoryAddress: `0x${string}`,
  payer: `0x${string}`,
  maxSupply: number,
  fallbackPerTenWei: bigint,
  holdings?: import('@/lib/creator-access').CreatorNftHoldings,
): Promise<bigint> {
  return resolveRequiredPublishFeeWei(
    client,
    factoryAddress,
    payer,
    maxSupply,
    fallbackPerTenWei,
    holdings,
  )
}

export async function readRequiredMintPaymentWei(
  client: PublicClient,
  collectionAddress: `0x${string}`,
  minter: `0x${string}`,
  mintCount: number,
  fallbackBaseWei: bigint,
  platformFeeExempt: boolean,
): Promise<bigint> {
  try {
    return await client.readContract({
      address: collectionAddress,
      abi: NFT_ABI,
      functionName: 'requiredMintPayment',
      args: [minter, BigInt(mintCount)],
    })
  } catch {
    const base = fallbackBaseWei * BigInt(mintCount)
    if (platformFeeExempt) return base
    return base + (base * 300n) / 10_000n
  }
}

function collectionAddressFromDeployLog(log: Log, factoryAddress: string): `0x${string}` | null {
  if (log.address.toLowerCase() !== factoryAddress.toLowerCase()) return null
  if (!log.topics[2]) return null
  try {
    return getAddress(`0x${log.topics[2].slice(-40)}`)
  } catch {
    return null
  }
}

function parseCollectionDeployedAddress(receipt: TransactionReceipt, factoryAddress: string): `0x${string}` | null {
  const factory = factoryAddress.toLowerCase()
  const candidateLogs = receipt.logs.filter((log) => log.address.toLowerCase() === factory)
  const logsToScan = candidateLogs.length > 0 ? candidateLogs : receipt.logs

  const events = parseEventLogs({
    abi: [...FACTORY_ABI, ...FACTORY_V2_ABI],
    logs: logsToScan,
  })
  const deployed = events.find(
    (event) => event.eventName === 'CollectionDeployed' || event.eventName === 'CollectionDeployedV2',
  )?.args.collection
  if (deployed) return deployed

  for (const log of logsToScan) {
    try {
      const event = decodeEventLog({
        abi: [...FACTORY_ABI, ...FACTORY_V2_ABI],
        data: log.data,
        topics: log.topics,
      })
      if (event.eventName === 'CollectionDeployed' || event.eventName === 'CollectionDeployedV2') {
        return event.args.collection
      }
    } catch {
      // try next log
    }
  }

  for (const log of logsToScan) {
    const fromTopic = collectionAddressFromDeployLog(log, factory)
    if (fromTopic) return fromTopic
  }

  return null
}

export function resolveDeployedCollectionAddress(
  receipt: TransactionReceipt,
  factoryAddress: string,
  creatorAddress?: string,
): `0x${string}` {
  if (receipt.status === 'reverted') {
    throw new Error(
      'Deploy transaction reverted on-chain (no collection was created). This usually means the publish fee was too low or the factory rejected the deploy — check the transaction on the block explorer.',
    )
  }

  const factory = factoryAddress.toLowerCase()
  const collection = parseCollectionDeployedAddress(receipt, factory)

  if (!collection) {
    throw new Error(
      'Could not find CollectionDeployed event in the deploy transaction. The transaction may have failed, or the RPC returned incomplete logs — open the transaction in your block explorer and contact support with the tx hash if ETN was deducted.',
    )
  }

  if (creatorAddress && collection.toLowerCase() === creatorAddress.toLowerCase()) {
    throw new Error('Deploy transaction did not return a valid collection contract address.')
  }

  return collection
}
