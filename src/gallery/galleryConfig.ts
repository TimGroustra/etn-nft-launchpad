import {
  fetchAllMintedTokenIdsFromSupabase,
  fetchGalleryMintedTokenIds,
  parseAllowedTokenIds,
  resolveGalleryPanelTokenIds,
} from '@/lib/gallery-minted-token-ids'
import { personalPanelKey, PERSONAL_PANEL_SLOTS } from '@/lib/personal-gallery'
import type { GalleryLayoutPreset } from '@/gallery/layouts/galleryLayouts'
import { supabase } from '@/lib/supabase'

export interface NftCollection {
  name: string
  contractAddress: string
  tokenIds: number[]
  mintedTokenIds: number[]
  currentIndex: number
  show_collection: boolean
  wall_color: string | null
  text_color: string | null
}

export interface PanelConfig {
  [wallName: string]: NftCollection
}

export type GalleryInitOptions = {
  layout?: GalleryLayoutPreset
  roomId?: string | null
}

const ETN_VIDEO_NFT_ADDRESS = '0x7F41080A13f5154Bcf9f72991AFEEd645b13B75C'
const DEFAULT_WALL_COLOR = '#4A235A'
const DEFAULT_TEXT_COLOR = '#F4D03F'

const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall']
const NUM_SEGMENTS_TO_USE = 5

type GalleryRow = {
  panel_key: string
  room_id?: string | null
  collection_name: string | null
  contract_address: string | null
  default_token_id: number | null
  show_collection: boolean | null
  allowed_token_ids: string | null
  wall_color: string | null
  text_color: string | null
}

type GalleryContextKey = 'main' | `room:${string}`

type GalleryContextState = {
  galleryConfig: PanelConfig
  dbConfigMap: Map<string, GalleryRow>
  configHydrated: boolean
  configReadyListeners: Set<() => void>
  initPromise: Promise<void> | null
}

function contextKey(options: GalleryInitOptions): GalleryContextKey {
  return options.roomId ? `room:${options.roomId}` : 'main'
}

const contexts = new Map<GalleryContextKey, GalleryContextState>()
let activeContextKey: GalleryContextKey = 'main'

function createBlankPanel(): NftCollection {
  return {
    name: 'Loading...',
    contractAddress: '',
    tokenIds: [],
    mintedTokenIds: [],
    currentIndex: 0,
    show_collection: true,
    wall_color: DEFAULT_WALL_COLOR,
    text_color: DEFAULT_TEXT_COLOR,
  }
}

function buildMainPanelConfig(): PanelConfig {
  const config: PanelConfig = {}
  for (let i = 0; i < NUM_SEGMENTS_TO_USE; i++) {
    for (const wallNameBase of WALL_NAMES) {
      config[`${wallNameBase}-${i}-ground`] = createBlankPanel()
      config[`${wallNameBase}-${i}-first`] = createBlankPanel()
    }
  }
  const innerWallNames = ['north-inner-wall', 'south-inner-wall', 'east-inner-wall', 'west-inner-wall']
  for (let i = 0; i < 2; i++) {
    for (const wallNameBase of innerWallNames) {
      config[`${wallNameBase}-inner-${i}`] = createBlankPanel()
      config[`${wallNameBase}-outer-${i}`] = createBlankPanel()
    }
  }
  const centerWallNames = ['north-center-wall', 'south-center-wall', 'east-center-wall', 'west-center-wall']
  for (const wallNameBase of centerWallNames) {
    config[`${wallNameBase}-0`] = createBlankPanel()
  }
  return config
}

function buildPersonalPanelConfig(roomId: string): PanelConfig {
  const config: PanelConfig = {}
  for (const slot of PERSONAL_PANEL_SLOTS) {
    config[personalPanelKey(roomId, slot)] = createBlankPanel()
  }
  return config
}

function getOrCreateContext(key: GalleryContextKey, options: GalleryInitOptions): GalleryContextState {
  const existing = contexts.get(key)
  if (existing) return existing

  const state: GalleryContextState = {
    galleryConfig:
      options.layout === 'personal' && options.roomId
        ? buildPersonalPanelConfig(options.roomId)
        : buildMainPanelConfig(),
    dbConfigMap: new Map(),
    configHydrated: false,
    configReadyListeners: new Set(),
    initPromise: null,
  }
  contexts.set(key, state)
  return state
}

function activeState(): GalleryContextState {
  return getOrCreateContext(activeContextKey, {
    layout: activeContextKey.startsWith('room:') ? 'personal' : 'main',
    roomId: activeContextKey.startsWith('room:') ? activeContextKey.slice(5) : null,
  })
}

function notifyConfigReady(state: GalleryContextState) {
  state.configHydrated = true
  for (const listener of state.configReadyListeners) listener()
  state.configReadyListeners.clear()
}

function applyBasePanelFromRow(
  state: GalleryContextState,
  panelKey: string,
  configFromDb: GalleryRow | undefined,
) {
  if (configFromDb?.contract_address) {
    state.galleryConfig[panelKey] = {
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
    state.galleryConfig[panelKey] = {
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

function applyTokenAssignments(state: GalleryContextState, tokenMap: Record<string, number[]>) {
  for (const panelKey in state.galleryConfig) {
    const configFromDb = state.dbConfigMap.get(panelKey)
    if (!configFromDb?.contract_address) continue

    const contractAddress = configFromDb.contract_address
    const defaultTokenId = configFromDb.default_token_id || 1
    const showCollection = configFromDb.show_collection ?? true
    const mintedTokenIds = tokenMap[contractAddress.toLowerCase()] ?? tokenMap[contractAddress] ?? []

    const allowedTokenIds = parseAllowedTokenIds(configFromDb.allowed_token_ids)
    const assigned = resolveGalleryPanelTokenIds(
      mintedTokenIds,
      defaultTokenId,
      showCollection,
      allowedTokenIds,
    )
    const tokensToUse = assigned.tokenIds
    const panelMintedIds = assigned.mintedTokenIds
    const startIndex = Math.max(0, tokensToUse.indexOf(defaultTokenId))

    state.galleryConfig[panelKey] = {
      ...state.galleryConfig[panelKey],
      tokenIds: tokensToUse,
      mintedTokenIds: panelMintedIds,
      currentIndex: tokensToUse.length > 0 ? startIndex : 0,
    }
  }
}

function applyPanelTokenFallbacks(state: GalleryContextState) {
  for (const panelKey in state.galleryConfig) {
    const configFromDb = state.dbConfigMap.get(panelKey)
    const panel = state.galleryConfig[panelKey]
    if (!configFromDb?.contract_address || panel.tokenIds.length > 0) continue

    const defaultTokenId = Math.max(1, Number(configFromDb.default_token_id) || 1)
    state.galleryConfig[panelKey] = {
      ...panel,
      tokenIds: [defaultTokenId],
      currentIndex: 0,
    }
  }
}

async function loadPanelAssignmentsFromSupabase(state: GalleryContextState): Promise<void> {
  const uniqueContracts = Array.from(
    new Set(
      [...state.dbConfigMap.values()]
        .map((c) => c.contract_address?.trim().toLowerCase())
        .filter((addr): addr is string => !!addr),
    ),
  )

  const tokenMap = await fetchAllMintedTokenIdsFromSupabase(uniqueContracts)
  applyTokenAssignments(state, tokenMap)
  applyPanelTokenFallbacks(state)
  notifyConfigReady(state)
}

async function loadGalleryConfigFromDb(state: GalleryContextState, options: GalleryInitOptions): Promise<void> {
  let query = supabase.from('gallery_config').select('*')
  if (options.roomId) {
    query = query.eq('room_id', options.roomId)
  } else {
    query = query.is('room_id', null)
  }

  const { data: dbConfigs, error } = await query
  const rows = (dbConfigs ?? []) as GalleryRow[]

  state.dbConfigMap = new Map<string, GalleryRow>()
  rows.forEach((item) => state.dbConfigMap.set(item.panel_key, item))

  if (error) {
    for (const wallName in state.galleryConfig) {
      state.galleryConfig[wallName] = {
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

  for (const panelKey in state.galleryConfig) {
    applyBasePanelFromRow(state, panelKey, state.dbConfigMap.get(panelKey))
  }
}

async function initializeGalleryConfig(options: GalleryInitOptions = {}): Promise<void> {
  const key = contextKey(options)
  activeContextKey = key
  const state = getOrCreateContext(key, options)
  state.configHydrated = false
  await loadGalleryConfigFromDb(state, options)
  await loadPanelAssignmentsFromSupabase(state)
}

export function isGalleryConfigReady(): boolean {
  return activeState().configHydrated
}

export function onGalleryConfigReady(listener: () => void): () => void {
  const state = activeState()
  if (state.configHydrated) {
    listener()
    return () => {}
  }
  state.configReadyListeners.add(listener)
  return () => state.configReadyListeners.delete(listener)
}

export function prefetchGalleryConfig(options: GalleryInitOptions = {}): Promise<void> {
  const key = contextKey(options)
  activeContextKey = key
  const state = getOrCreateContext(key, options)
  if (!state.initPromise) {
    state.initPromise = initializeGalleryConfig(options).catch((error) => {
      state.initPromise = null
      throw error
    })
  }
  return state.initPromise
}

export function getGalleryPanelConfig(): PanelConfig {
  return activeState().galleryConfig
}

/** @deprecated Use getGalleryPanelConfig() — kept for gradual migration */
export const GALLERY_PANEL_CONFIG: PanelConfig = new Proxy({} as PanelConfig, {
  get(_target, prop: string) {
    return activeState().galleryConfig[prop]
  },
  set(_target, prop: string, value) {
    activeState().galleryConfig[prop] = value
    return true
  },
})

export const getCurrentNftSource = (wallName: string) => {
  const config = activeState().galleryConfig[wallName]
  if (!config?.contractAddress || config.tokenIds.length === 0) return null
  return {
    contractAddress: config.contractAddress,
    tokenId: config.tokenIds[config.currentIndex],
  }
}

export const updatePanelIndex = (wallName: string, direction: 'next' | 'prev') => {
  const config = activeState().galleryConfig[wallName]
  if (!config || config.tokenIds.length === 0) return false

  const delta = direction === 'next' ? 1 : -1
  const newIndex = (config.currentIndex + delta + config.tokenIds.length) % config.tokenIds.length
  if (newIndex !== config.currentIndex) {
    config.currentIndex = newIndex
    return true
  }
  return false
}

export function getAllPanelTokenSources(): Array<{ contractAddress: string; tokenId: number }> {
  const galleryConfig = activeState().galleryConfig
  const seen = new Set<string>()
  const sources: Array<{ contractAddress: string; tokenId: number }> = []

  for (const panelKey of Object.keys(galleryConfig)) {
    const source = getCurrentNftSource(panelKey)
    if (!source) continue
    const key = `${source.contractAddress.toLowerCase()}:${source.tokenId}`
    if (seen.has(key)) continue
    seen.add(key)
    sources.push(source)
  }

  return sources
}

export async function hydrateMintedTokenIds(): Promise<void> {
  const state = activeState()
  const uniqueContracts = Array.from(
    new Set(
      [...state.dbConfigMap.values()]
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

  applyTokenAssignments(state, tokenMap)
  applyPanelTokenFallbacks(state)
  notifyConfigReady(state)
}
