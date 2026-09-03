import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { enqueueGalleryTokens, syncGalleryPanelTokenIndex } from '@/lib/gallery-cache'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import NftPreviewPane from '@/components/gallery/NftPreviewPane'
import { Loader2, Gem, ArrowLeft, Map as MapIcon, Settings, Eye } from 'lucide-react'
import { useAvailableGems } from '@/hooks/use-available-gems'
import { canEditGallery } from '@/lib/gallery-access'
import FloorPlan from '@/components/gallery-config/FloorPlan'
import PanelPickerList from '@/components/gallery-config/PanelPickerList'
import SettingsPanel from '@/components/gallery-config/SettingsPanel'

interface GalleryConfigRow {
  panel_key: string
  collection_name: string | null
  contract_address: string | null
  default_token_id: number | null
  show_collection: boolean | null
  allowed_token_ids: string | null
  wall_color: string | null
  text_color: string | null
}

interface PanelLock {
  panel_id: string
  locked_by_address: string
  locked_until: string
  locking_gem_token_id: string | null
}

const REQUIRED_GEM_BALANCE = 1
type OuterFloor = 'ground' | 'first'
type OuterWall = 'north' | 'south' | 'east' | 'west'

const outerLabel = (wall: OuterWall, index: number, floor: OuterFloor) => {
  const base = wall.charAt(0).toUpperCase() + wall.slice(1)
  const floorLabel = floor === 'ground' ? 'G' : '1F'
  return `${base} Wall Segment ${index + 1} (${floorLabel})`
}

const formatWalletAddress = (address: string | undefined | null) => {
  if (!address) return 'N/A'
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const DEFAULT_WALL_COLOR = '#36454F'
const DEFAULT_TEXT_COLOR = '#40E0D0'

export default function GalleryConfigPage() {
  const navigate = useNavigate()
  const { address: walletAddress, isConnected } = useAccount()

  const {
    availableTokens,
    ownedTokens,
    isLoading: isGemsLoading,
    refetch: refetchGems,
  } = useAvailableGems(walletAddress || null)

  const [selectedPanelKey, setSelectedPanelKey] = useState<string>('')
  const [currentConfig, setCurrentConfig] = useState<Partial<GalleryConfigRow>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [panelLocks, setPanelLocks] = useState<PanelLock[]>([])
  const [lockDurationDays, setLockDurationDays] = useState(0)
  const [outerFloor, setOuterFloor] = useState<OuterFloor>('ground')
  const [activeTab, setActiveTab] = useState<string>('map')

  const canEdit = canEditGallery(ownedTokens.length)

  useEffect(() => {
    if (!isConnected || !walletAddress) {
      navigate('/gallery')
      return
    }
    if (!isGemsLoading && !canEdit) {
      toast.error(`Insufficient ElectroGems (${ownedTokens.length}/${REQUIRED_GEM_BALANCE})`)
      navigate('/gallery')
    }
  }, [isConnected, walletAddress, isGemsLoading, canEdit, ownedTokens.length, navigate])

  useEffect(() => {
    if (!isGemsLoading && canEdit) {
      const fetchLocks = async () => {
        const { data } = await supabase
          .from('panel_locks')
          .select('panel_id, locked_by_address, locked_until, locking_gem_token_id')
        if (data) setPanelLocks(data as PanelLock[])
      }
      void fetchLocks()
    }
  }, [isGemsLoading, canEdit])

  const getLockStatus = useCallback(
    (panelKey: string) => {
      const lock = panelLocks.find((l) => l.panel_id === panelKey)
      if (!lock) return { isLocked: false, isLockedByMe: false, lockedUntil: null, lockingGemTokenId: null }
      const until = new Date(lock.locked_until)
      if (until <= new Date())
        return { isLocked: false, isLockedByMe: false, lockedUntil: null, lockingGemTokenId: null }
      const isByMe =
        !!walletAddress && lock.locked_by_address.toLowerCase() === walletAddress.toLowerCase()
      return {
        isLocked: true,
        isLockedByMe: isByMe,
        lockedUntil: until,
        lockingGemTokenId: lock.locking_gem_token_id,
      }
    },
    [panelLocks, walletAddress],
  )

  const selectedLock = useMemo(() => {
    if (!selectedPanelKey)
      return { isLocked: false, isLockedByMe: false, lockedUntil: null, lockingGemTokenId: null }
    return getLockStatus(selectedPanelKey)
  }, [selectedPanelKey, getLockStatus])

  const fetchPanelConfig = useCallback(async (panelKey: string) => {
    if (!panelKey) {
      setCurrentConfig({})
      return
    }
    setIsLoading(true)
    const { data } = await supabase.from('gallery_config').select('*').eq('panel_key', panelKey).maybeSingle()

    setCurrentConfig({
      panel_key: panelKey,
      collection_name: (data as GalleryConfigRow | null)?.collection_name || '',
      contract_address: (data as GalleryConfigRow | null)?.contract_address || '',
      default_token_id: (data as GalleryConfigRow | null)?.default_token_id || 1,
      show_collection: (data as GalleryConfigRow | null)?.show_collection ?? false,
      allowed_token_ids: (data as GalleryConfigRow | null)?.allowed_token_ids || '',
    })
    setIsLoading(false)
  }, [])

  const handlePanelSelect = useCallback(
    (panelKey: string) => {
      setSelectedPanelKey(panelKey)
      if (window.matchMedia('(max-width: 1023px)').matches) {
        setActiveTab('settings')
      }
    },
    [],
  )

  useEffect(() => {
    if (selectedPanelKey) {
      void fetchPanelConfig(selectedPanelKey)
    }
  }, [selectedPanelKey, fetchPanelConfig])

  const handleSave = async () => {
    if (isGemsLoading || !canEdit || !selectedPanelKey || !walletAddress) return

    if (!currentConfig.contract_address || currentConfig.contract_address.trim() === '') {
      toast.error('Please enter a contract address.')
      return
    }

    setIsLoading(true)
    const lockStatus = getLockStatus(selectedPanelKey)
    if (lockStatus.isLocked && !lockStatus.isLockedByMe) {
      toast.error('Panel locked by another user.')
      setIsLoading(false)
      return
    }

    const lockGem =
      lockStatus.isLockedByMe && lockStatus.lockingGemTokenId
        ? lockStatus.lockingGemTokenId
        : availableTokens[0]

    const { data, error } = await supabase.functions.invoke('gallery-save-panel', {
      method: 'POST',
      body: {
        walletAddress,
        panelKey: selectedPanelKey,
        collection_name: currentConfig.collection_name || null,
        contract_address: currentConfig.contract_address.trim(),
        default_token_id: currentConfig.default_token_id || 1,
        show_collection: currentConfig.show_collection ?? false,
        allowed_token_ids: currentConfig.allowed_token_ids?.trim() || null,
        wall_color: DEFAULT_WALL_COLOR,
        text_color: DEFAULT_TEXT_COLOR,
        lockDurationDays,
        lockingGemTokenId: lockGem,
      },
    })

    if (error || (data as { error?: string })?.error) {
      toast.error((data as { error?: string })?.error || error?.message || 'Save failed.')
      setIsLoading(false)
      return
    }

    const savedContract = currentConfig.contract_address?.trim().toLowerCase()
    const savedTokenId = currentConfig.default_token_id || 1
    if (savedContract) {
      enqueueGalleryTokens(savedContract, [savedTokenId])
      syncGalleryPanelTokenIndex()
    }

    if (lockDurationDays === 0 && lockStatus.isLockedByMe) {
      setPanelLocks((prev) => prev.filter((l) => l.panel_id !== selectedPanelKey))
      toast.success('Configuration saved and panel unlocked.')
      refetchGems()
    } else if (lockDurationDays > 0) {
      const until = new Date(Date.now() + lockDurationDays * 86400000).toISOString()
      setPanelLocks((prev) => [
        ...prev.filter((l) => l.panel_id !== selectedPanelKey),
        {
          panel_id: selectedPanelKey,
          locked_by_address: walletAddress,
          locked_until: until,
          locking_gem_token_id: lockGem,
        },
      ])
      toast.success(`Saved and locked for ${lockDurationDays} days.`)
      refetchGems()
    } else {
      toast.success('Configuration saved.')
    }

    setIsLoading(false)
  }

  const getFriendlyLabel = useCallback((key: string) => {
    const match = key.match(/^(north|south|east|west)-wall-(\d+)-(ground|first)$/)
    if (match) return outerLabel(match[1] as OuterWall, parseInt(match[2]), match[3] as OuterFloor)

    const innerMatch = key.match(/^(north|south|east|west)-inner-wall-(outer|inner)-(\d+)$/)
    if (innerMatch) {
      const wall = innerMatch[1].charAt(0).toUpperCase() + innerMatch[1].slice(1)
      const side = innerMatch[2] === 'outer' ? 'Outer' : 'Inner'
      const index = parseInt(innerMatch[3]) + 1
      return `Inner ${wall} Segment ${index} (${side} Side)`
    }

    return key
  }, [])

  const friendlyLabel = useMemo(
    () => getFriendlyLabel(selectedPanelKey),
    [selectedPanelKey, getFriendlyLabel],
  )

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-slate-950 p-3 text-white sm:p-6 lg:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 pb-8">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/gallery/config')}
              className="h-10 w-fit px-0 text-sm hover:bg-transparent"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Configure Hub
            </Button>
            <div className="flex w-fit items-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-xs">
              <Gem className="h-4 w-4 shrink-0 text-cyan-400" />
              <span>
                Gems: <strong>{ownedTokens.length}</strong>
              </span>
              <span className="hidden text-slate-500 sm:inline">|</span>
              <span className="truncate opacity-60">{formatWalletAddress(walletAddress)}</span>
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Main Gallery Configuration</h1>
            <p className="text-sm text-slate-400">
              Customise wall panels with content from any Electroneum collection.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          <Card className="flex h-fit flex-col">
            <CardContent className="p-4 sm:p-6">
              <div className="lg:hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="sticky top-0 z-20 mb-4 grid w-full grid-cols-3 bg-slate-900/95 backdrop-blur">
                    <TabsTrigger value="map" className="min-h-11">
                      <MapIcon className="mr-1 h-4 w-4" /> Panels
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="min-h-11">
                      <Settings className="mr-1 h-4 w-4" /> Settings
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="min-h-11">
                      <Eye className="mr-1 h-4 w-4" /> Preview
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="map">
                    <PanelPickerList
                      outerFloor={outerFloor}
                      setOuterFloor={setOuterFloor}
                      selectedPanelKey={selectedPanelKey}
                      onSelectPanel={handlePanelSelect}
                      getLockStatus={getLockStatus}
                      getFriendlyLabel={getFriendlyLabel}
                    />
                  </TabsContent>
                  <TabsContent value="settings">
                    <SettingsPanel
                      selectedPanelKey={selectedPanelKey}
                      friendlyLabel={friendlyLabel}
                      currentConfig={currentConfig}
                      setCurrentConfig={setCurrentConfig}
                      lockDurationDays={lockDurationDays}
                      setLockDurationDays={setLockDurationDays}
                      handleSave={handleSave}
                      isLoading={isLoading}
                      selectedLock={selectedLock}
                      onOpenMap={() => setActiveTab('map')}
                    />
                  </TabsContent>
                  <TabsContent value="preview">
                    <div className="pt-4">
                      <NftPreviewPane
                        contractAddress={currentConfig.contract_address || null}
                        tokenId={currentConfig.default_token_id || null}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
              <div className="hidden space-y-6 lg:block">
                <FloorPlan
                  outerFloor={outerFloor}
                  setOuterFloor={setOuterFloor}
                  selectedPanelKey={selectedPanelKey}
                  setSelectedPanelKey={handlePanelSelect}
                  getLockStatus={getLockStatus}
                  getFriendlyLabel={getFriendlyLabel}
                />
                <SettingsPanel
                  selectedPanelKey={selectedPanelKey}
                  friendlyLabel={friendlyLabel}
                  currentConfig={currentConfig}
                  setCurrentConfig={setCurrentConfig}
                  lockDurationDays={lockDurationDays}
                  setLockDurationDays={setLockDurationDays}
                  handleSave={handleSave}
                  isLoading={isLoading}
                  selectedLock={selectedLock}
                />
              </div>
            </CardContent>
          </Card>
          <div className="hidden h-fit space-y-6 lg:sticky lg:top-8 lg:block">
            <NftPreviewPane
              contractAddress={currentConfig.contract_address || null}
              tokenId={currentConfig.default_token_id || null}
            />
          </div>
        </div>

        {isGemsLoading && (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading gem holdings…
          </div>
        )}
      </div>
    </div>
  )
}
