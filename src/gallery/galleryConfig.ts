import {
  buildGemShardPanelAssignments,
  fetchGalleryMintedTokenIds,
  isGemShardsGalleryContract,
  resolveGalleryPanelTokenIds,
} from '@/lib/gallery-minted-token-ids'
import { supabase } from '@/lib/supabase'

export interface NftCollection {
  name: string
  contractAddress: string
  tokenIds: number[]
  /** On-chain minted IDs for marketplace validation. */
  mintedTokenIds: number[]
  currentIndex: number
  show_collection: boolean
  wall_color: string | null
  text_color: string | null
}

export interface PanelConfig {
  [wallName: string]: NftCollection
}

const ETN_VIDEO_NFT_ADDRESS = '0x7F41080A13f5154Bcf9f72991AFEEd645b13B75C'
const DEFAULT_WALL_COLOR = '#4A235A'
const DEFAULT_TEXT_COLOR = '#F4D03F'

const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall']
const NUM_SEGMENTS_TO_USE = 5

let galleryConfig: PanelConfig = {}

const createBlankPanel = (): NftCollection => ({
  name: 'Loading...',
  contractAddress: '',
  tokenIds: [],
  mintedTokenIds: [],
  currentIndex: 0,
  show_collection: true,
  wall_color: DEFAULT_WALL_COLOR,
  text_color: DEFAULT_TEXT_COLOR,
})

for (let i = 0; i < NUM_SEGMENTS_TO_USE; i++) {
  for (const wallNameBase of WALL_NAMES) {
    galleryConfig[`${wallNameBase}-${i}-ground`] = createBlankPanel()
    galleryConfig[`${wallNameBase}-${i}-first`] = createBlankPanel()
  }
}

const INNER_WALL_NAMES = ['north-inner-wall', 'south-inner-wall', 'east-inner-wall', 'west-inner-wall']
for (let i = 0; i < 2; i++) {
  for (const wallNameBase of INNER_WALL_NAMES) {
    galleryConfig[`${wallNameBase}-inner-${i}`] = createBlankPanel()
    galleryConfig[`${wallNameBase}-outer-${i}`] = createBlankPanel()
  }
}

const CENTER_WALL_NAMES = ['north-center-wall', 'south-center-wall', 'east-center-wall', 'west-center-wall']
for (const wallNameBase of CENTER_WALL_NAMES) {
  galleryConfig[`${wallNameBase}-0`] = createBlankPanel()
}

export async function initializeGalleryConfig() {
  const { data: dbConfigs, error } = await supabase.from('gallery_config').select('*')

  type GalleryRow = {
    panel_key: string
    collection_name: string | null
    contract_address: string | null
    default_token_id: number | null
    show_collection: boolean | null
    wall_color: string | null
    text_color: string | null
  }

  const rows = (dbConfigs ?? []) as GalleryRow[]

  if (error) {
    for (const wallName in galleryConfig) {
      galleryConfig[wallName] = {
        name: 'Curated by Gem holders',
        contractAddress: '',
        tokenIds: [],
        mintedTokenIds: [],
        currentIndex: 0,
        show_collection: true,
        wall_color: DEFAULT_WALL_COLOR,
        text_color: DEFAULT_TEXT_COLOR,
      }
    }
    return
  }

  const dbConfigMap = new Map<string, GalleryRow>()
  rows.forEach((item) => dbConfigMap.set(item.panel_key, item))

  const uniqueContracts = Array.from(
    new Set(
      rows
        .map((c) => c.contract_address)
        .filter((addr): addr is string => !!addr && addr.trim() !== ''),
    ),
  )

  const tokenMap: Record<string, number[]> = {}
  for (const address of uniqueContracts) {
    if (address === ETN_VIDEO_NFT_ADDRESS) {
      tokenMap[address] = [1]
      continue
    }
    try {
      tokenMap[address] = await fetchGalleryMintedTokenIds(address)
    } catch {
      tokenMap[address] = []
    }
  }

  const gemShardPanelKeys = Object.keys(galleryConfig)
    .filter((panelKey) => {
      const row = dbConfigMap.get(panelKey)
      return row?.contract_address && isGemShardsGalleryContract(row.contract_address)
    })
    .sort()

  const gemShardContract = uniqueContracts.find((address) => isGemShardsGalleryContract(address))
  const gemShardMintedIds = gemShardContract ? (tokenMap[gemShardContract] ?? []) : []
  const gemShardAssignments = buildGemShardPanelAssignments(
    gemShardPanelKeys,
    gemShardMintedIds,
    (panelKey) => dbConfigMap.get(panelKey)?.show_collection ?? true,
  )

  for (const panelKey in galleryConfig) {
    const configFromDb = dbConfigMap.get(panelKey)

    if (configFromDb?.contract_address) {
      const contractAddress = configFromDb.contract_address
      const defaultTokenId = configFromDb.default_token_id || 1
      const showCollection = configFromDb.show_collection ?? true
      const mintedTokenIds = tokenMap[contractAddress] ?? []

      const assigned = isGemShardsGalleryContract(contractAddress)
        ? gemShardAssignments.get(panelKey)
        : resolveGalleryPanelTokenIds(mintedTokenIds, defaultTokenId, showCollection)

      const tokensToUse = assigned?.tokenIds ?? []
      const panelMintedIds = assigned?.mintedTokenIds ?? []
      const startIndex = isGemShardsGalleryContract(contractAddress)
        ? 0
        : Math.max(0, tokensToUse.indexOf(defaultTokenId))

      galleryConfig[panelKey] = {
        name: configFromDb.collection_name || 'Unnamed Collection',
        contractAddress,
        tokenIds: tokensToUse,
        mintedTokenIds: panelMintedIds,
        currentIndex: tokensToUse.length > 0 ? startIndex : 0,
        show_collection: showCollection,
        wall_color: configFromDb.wall_color || DEFAULT_WALL_COLOR,
        text_color: configFromDb.text_color || DEFAULT_TEXT_COLOR,
      }
    } else {
      galleryConfig[panelKey] = {
        name: 'Blank Panel',
        contractAddress: '',
        tokenIds: [],
        mintedTokenIds: [],
        currentIndex: 0,
        show_collection: true,
        wall_color: DEFAULT_WALL_COLOR,
        text_color: DEFAULT_TEXT_COLOR,
      }
    }
  }
}

export const GALLERY_PANEL_CONFIG = galleryConfig

export const getCurrentNftSource = (wallName: keyof PanelConfig) => {
  const config = GALLERY_PANEL_CONFIG[wallName]
  if (!config?.contractAddress || config.tokenIds.length === 0) return null
  return {
    contractAddress: config.contractAddress,
    tokenId: config.tokenIds[config.currentIndex],
  }
}

export const updatePanelIndex = (wallName: keyof PanelConfig, direction: 'next' | 'prev') => {
  const config = GALLERY_PANEL_CONFIG[wallName]
  if (!config || config.tokenIds.length === 0) return false

  const delta = direction === 'next' ? 1 : -1
  const newIndex = (config.currentIndex + delta + config.tokenIds.length) % config.tokenIds.length
  if (newIndex !== config.currentIndex) {
    config.currentIndex = newIndex
    return true
  }
  return false
}
