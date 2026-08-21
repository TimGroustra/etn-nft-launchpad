import { defineChain } from 'viem'

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

export function getChainKey(chainId: number): NetworkKey {
  return chainId === electroneumTestnet.id ? 'testnet' : 'mainnet'
}

export function getChainByKey(key: NetworkKey) {
  return key === 'testnet' ? electroneumTestnet : electroneum
}

export function getChainId(key: NetworkKey): number {
  return getChainByKey(key).id
}

export const CLUB_TOKEN_ADDRESS = '0xC9FC4AB00911793D99b5c7Bd01f01203C21D4131'
export const WETN_ADDRESS = '0x138DAFbDA0CCB3d8E39C19edb0510Fc31b7C1c77'
export const ELECTROSWAP_V3_ROUTER = '0xfdB0d62Fc929fD53D266B969Bfe4250b205D0899' as const
export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as const

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

export function getFactoryAddress(network: NetworkKey): `0x${string}` {
  if (network === 'testnet') {
    return (import.meta.env.VITE_FACTORY_ADDRESS_TESTNET ?? ZERO_ADDRESS) as `0x${string}`
  }
  return (import.meta.env.VITE_FACTORY_ADDRESS_MAINNET ?? import.meta.env.VITE_FACTORY_ADDRESS ?? ZERO_ADDRESS) as `0x${string}`
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

export const FACTORY_ABI = [
  {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      {
        name: 'burnConfig',
        type: 'tuple',
        components: [
          { name: 'clubBurnAmount', type: 'uint256' },
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
          { name: 'clubBurnAmount', type: 'uint256' },
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
] as const
