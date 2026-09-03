import {
  fetchAllMintedTokenIdsFromSupabase,
  fetchGalleryMintedTokenIds,
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

type GalleryRow = {
  panel_key: string
  collection_name: string | null
  contract_address: string | null
  default_token_id: number | null
  show_collection: boolean | null
  wall_color: string | null
  text_color: string | null
}

let dbConfigMap = new Map<string, GalleryRow>()
let configHydrated = false
const configReadyListeners = new Set<() => void>()

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

function applyBasePanelFromRow(panelKey: string, configFromDb: GalleryRow | undefined) {
  if (configFromDb?.contract_address) {
    galleryConfig[panelKey] = {
      name: configFromDb.collection_name || 'Unnamed Collection',
      contractAddress: configFromDb.contract_address,
      tokenIds: [],
      mintedTokenIds: [],
      currentIndex: 0,
      show_collection: configFromDb.show_collection ?? true,
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

function notifyConfigReady() {
  configHydrated = true
  for (const listener of configReadyListeners) listener()
  configReadyListeners.clear()
}

function applyTokenAssignments(tokenMap: Record<string, number[]>) {
  for (const panelKey in galleryConfig) {
    const configFromDb = dbConfigMap.get(panelKey)
    if (!configFromDb?.contract_address) continue

    const contractAddress = configFromDb.contract_address
    const defaultTokenId = configFromDb.default_token_id || 1
    const showCollection = configFromDb.show_collection ?? true
    const mintedTokenIds = tokenMap[contractAddress.toLowerCase()] ?? tokenMap[contractAddress] ?? []

    const assigned = resolveGalleryPanelTokenIds(mintedTokenIds, defaultTokenId, showCollection)
    const tokensToUse = assigned.tokenIds
    const panelMintedIds = assigned.mintedTokenIds
    const startIndex = Math.max(0, tokensToUse.indexOf(defaultTokenId))

    galleryConfig[panelKey] = {
      ...galleryConfig[panelKey],
      tokenIds: tokensToUse,
      mintedTokenIds: panelMintedIds,
      currentIndex: tokensToUse.length > 0 ? startIndex : 0,
    }
  }
}

/** When minted-ID cache is empty, fall back to configured default token (no RPC). */
function applyPanelTokenFallbacks() {
  for (const panelKey in galleryConfig) {
    const configFromDb = dbConfigMap.get(panelKey)
    const panel = galleryConfig[panelKey]
    if (!configFromDb?.contract_address || panel.tokenIds.length > 0) continue

    const defaultTokenId = Math.max(1, Number(configFromDb.default_token_id) || 1)
    galleryConfig[panelKey] = {
      ...panel,
      tokenIds: [defaultTokenId],
      currentIndex: 0,
    }
  }
}

/** Assign panel tokens from Supabase minted-ID cache only (no on-chain RPC). */
async function loadPanelAssignmentsFromSupabase(): Promise<void> {
  const uniqueContracts = Array.from(
    new Set(
      [...dbConfigMap.values()]
        .map((c) => c.contract_address?.trim().toLowerCase())
        .filter((addr): addr is string => !!addr),
    ),
  )

  const tokenMap = await fetchAllMintedTokenIdsFromSupabase(uniqueContracts)
  applyTokenAssignments(tokenMap)
  applyPanelTokenFallbacks()
  notifyConfigReady()
}

/** Fast path: load panel assignments from Supabase (no on-chain mint ID fetch). */
export async function loadGalleryConfigFromDb(): Promise<void> {
  const { data: dbConfigs, error } = await supabase.from('gallery_config').select('*')
  const rows = (dbConfigs ?? []) as GalleryRow[]

  dbConfigMap = new Map<string, GalleryRow>()
  rows.forEach((item) => dbConfigMap.set(item.panel_key, item))

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

  for (const panelKey in galleryConfig) {
    applyBasePanelFromRow(panelKey, dbConfigMap.get(panelKey))
  }
}

/** Resolve on-chain minted IDs (RPC) — only for explicit refresh, not gallery init. */
export async function hydrateMintedTokenIds(): Promise<void> {
  const uniqueContracts = Array.from(
    new Set(
      [...dbConfigMap.values()]
        .map((c) => c.contract_address)
        .filter((addr): addr is string => !!addr && addr.trim() !== ''),
    ),
  )

  const tokenMap: Record<string, number[]> = {}
  await Promise.all(
    uniqueContracts.map(async (address) => {
      if (address === ETN_VIDEO_NFT_ADDRESS) {
        tokenMap[address] = [1]
        return
      }
      try {
        tokenMap[address] = await fetchGalleryMintedTokenIds(address)
      } catch {
        tokenMap[address] = []
      }
    }),
  )

  applyTokenAssignments(tokenMap)
  applyPanelTokenFallbacks()
  notifyConfigReady()
}

export async function initializeGalleryConfig() {
  configHydrated = false
  await loadGalleryConfigFromDb()
  await loadPanelAssignmentsFromSupabase()
}

export function isGalleryConfigReady(): boolean {
  return configHydrated
}

export function onGalleryConfigReady(listener: () => void): () => void {
  if (configHydrated) {
    listener()
    return () => {}
  }
  configReadyListeners.add(listener)
  return () => configReadyListeners.delete(listener)
}

let galleryConfigPromise: Promise<void> | null = null

/** Start loading gallery config early (safe to call multiple times). */
export function prefetchGalleryConfig(): Promise<void> {
  if (!galleryConfigPromise) {
    galleryConfigPromise = initializeGalleryConfig().catch((error) => {
      galleryConfigPromise = null
      throw error
    })
  }
  return galleryConfigPromise
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

/** Collect all resolved panel token pairs for batch metadata prefetch. */
export function getAllPanelTokenSources(): Array<{ contractAddress: string; tokenId: number }> {
  const seen = new Set<string>()
  const sources: Array<{ contractAddress: string; tokenId: number }> = []

  for (const panelKey of Object.keys(galleryConfig)) {
    const source = getCurrentNftSource(panelKey as keyof PanelConfig)
    if (!source) continue
    const key = `${source.contractAddress.toLowerCase()}:${source.tokenId}`
    if (seen.has(key)) continue
    seen.add(key)
    sources.push(source)
  }

  return sources
}
