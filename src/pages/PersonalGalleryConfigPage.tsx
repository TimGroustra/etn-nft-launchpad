import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { ArrowLeft, Copy, ExternalLink, Eye, Loader2, Map as MapIcon, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import NftPreviewPane from '@/components/gallery/NftPreviewPane'
import PersonalFloorPlan from '@/components/gallery-config/PersonalFloorPlan'
import SettingsPanel from '@/components/gallery-config/SettingsPanel'
import { personalFriendlyLabel, personalPanelKeys } from '@/components/gallery-config/personalPanelKeys'
import { useAvailableGems } from '@/hooks/use-available-gems'
import { canEditGallery } from '@/lib/gallery-access'
import { personalGalleryShareUrl } from '@/lib/personal-gallery'
import { enqueueGalleryTokens, syncGalleryPanelTokenIndex } from '@/lib/gallery-cache'
import { supabase } from '@/lib/supabase'

interface GalleryConfigRow {
  panel_key: string
  collection_name: string | null
  contract_address: string | null
  default_token_id: number | null
  show_collection: boolean | null
  allowed_token_ids: string | null
}

interface PersonalRoom {
  id: string
  slug: string
  display_name: string
  owner_address: string
}

const DEFAULT_WALL_COLOR = '#36454F'
const DEFAULT_TEXT_COLOR = '#40E0D0'

export default function PersonalGalleryConfigPage() {
  const { roomId = '' } = useParams()
  const navigate = useNavigate()
  const { address: walletAddress, isConnected } = useAccount()
  const { ownedTokens, isLoading: isGemsLoading } = useAvailableGems(walletAddress || null)
  const canEdit = canEditGallery(ownedTokens.length)

  const [room, setRoom] = useState<PersonalRoom | null>(null)
  const [loadingRoom, setLoadingRoom] = useState(true)
  const [selectedPanelKey, setSelectedPanelKey] = useState('')
  const [currentConfig, setCurrentConfig] = useState<Partial<GalleryConfigRow>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('map')
  const [lastShareUrl, setLastShareUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isConnected || !walletAddress) {
      navigate('/gallery')
      return
    }
    if (!isGemsLoading && !canEdit) {
      navigate('/gallery')
    }
  }, [isConnected, walletAddress, isGemsLoading, canEdit, navigate])

  useEffect(() => {
    if (!roomId || !walletAddress) return
    const loadRoom = async () => {
      setLoadingRoom(true)
      const { data, error } = await supabase
        .from('personal_gallery_rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle()

      if (error || !data) {
        toast.error('Room not found.')
        navigate('/gallery/config/rooms')
        return
      }

      const row = data as PersonalRoom
      if (row.owner_address.toLowerCase() !== walletAddress.toLowerCase()) {
        toast.error('You do not own this gallery room.')
        navigate('/gallery/config/rooms')
        return
      }

      setRoom(row)
      setLastShareUrl(personalGalleryShareUrl(row.slug))
      const keys = personalPanelKeys(roomId)
      setSelectedPanelKey(keys[0] ?? '')
      setLoadingRoom(false)
    }
    void loadRoom()
  }, [roomId, walletAddress, navigate])

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

  useEffect(() => {
    if (selectedPanelKey) {
      void fetchPanelConfig(selectedPanelKey)
    }
  }, [selectedPanelKey, fetchPanelConfig])

  const handlePanelSelect = useCallback((panelKey: string) => {
    setSelectedPanelKey(panelKey)
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setActiveTab('settings')
    }
  }, [])

  const handleSave = async () => {
    if (!roomId || !walletAddress || !selectedPanelKey || !room) return
    if (!currentConfig.contract_address?.trim()) {
      toast.error('Please enter a contract address.')
      return
    }

    setIsLoading(true)
    const { data, error } = await supabase.functions.invoke('gallery-save-personal-panel', {
      method: 'POST',
      body: {
        walletAddress,
        roomId,
        panelKey: selectedPanelKey,
        collection_name: currentConfig.collection_name || null,
        contract_address: currentConfig.contract_address.trim(),
        default_token_id: currentConfig.default_token_id || 1,
        show_collection: currentConfig.show_collection ?? false,
        allowed_token_ids: currentConfig.allowed_token_ids?.trim() || null,
        wall_color: DEFAULT_WALL_COLOR,
        text_color: DEFAULT_TEXT_COLOR,
      },
    })

    if (error || (data as { error?: string })?.error) {
      toast.error((data as { error?: string })?.error || error?.message || 'Save failed.')
      setIsLoading(false)
      return
    }

    const savedContract = currentConfig.contract_address.trim().toLowerCase()
    const savedTokenId = currentConfig.default_token_id || 1
    enqueueGalleryTokens(savedContract, [savedTokenId])
    syncGalleryPanelTokenIndex()

    const shareUrl = (data as { shareUrl?: string })?.shareUrl ?? personalGalleryShareUrl(room.slug)
    setLastShareUrl(shareUrl)
    toast.success('Panel saved. Share link is ready to copy.')
    setIsLoading(false)
  }

  const copyShareLink = async () => {
    if (!lastShareUrl) return
    try {
      await navigator.clipboard.writeText(lastShareUrl)
      toast.success('Share link copied.')
    } catch {
      toast.message(lastShareUrl)
    }
  }

  const getFriendlyLabel = useCallback((key: string) => personalFriendlyLabel(key), [])
  const friendlyLabel = useMemo(
    () => getFriendlyLabel(selectedPanelKey),
    [selectedPanelKey, getFriendlyLabel],
  )

  if (loadingRoom || !room) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading room…
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-slate-950 p-3 text-white sm:p-6 lg:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 pb-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-10 w-fit px-0 text-sm hover:bg-transparent"
          >
            <Link to="/gallery/config/rooms">
              <ArrowLeft className="mr-2 h-4 w-4" /> My Rooms
            </Link>
          </Button>
          {lastShareUrl && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void copyShareLink()}>
                <Copy className="mr-2 h-4 w-4" />
                Copy Public Link
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={lastShareUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Public Gallery
                </a>
              </Button>
            </div>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-bold">{room.display_name}</h1>
          <p className="text-sm text-slate-400">
            Personal gallery · 10 wall panels · public link works without a wallet
          </p>
          {lastShareUrl && (
            <p className="mt-1 break-all text-xs text-slate-500">{lastShareUrl}</p>
          )}
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
                    <PersonalFloorPlan
                      roomId={roomId}
                      selectedPanelKey={selectedPanelKey}
                      setSelectedPanelKey={handlePanelSelect}
                      getFriendlyLabel={getFriendlyLabel}
                    />
                  </TabsContent>
                  <TabsContent value="settings">
                    <SettingsPanel
                      selectedPanelKey={selectedPanelKey}
                      friendlyLabel={friendlyLabel}
                      currentConfig={currentConfig}
                      setCurrentConfig={setCurrentConfig}
                      lockDurationDays={0}
                      setLockDurationDays={() => {}}
                      handleSave={handleSave}
                      isLoading={isLoading}
                      selectedLock={{ isLocked: false, isLockedByMe: false, lockedUntil: null }}
                      onOpenMap={() => setActiveTab('map')}
                      hideLocks
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
                <PersonalFloorPlan
                  roomId={roomId}
                  selectedPanelKey={selectedPanelKey}
                  setSelectedPanelKey={handlePanelSelect}
                  getFriendlyLabel={getFriendlyLabel}
                />
                <SettingsPanel
                  selectedPanelKey={selectedPanelKey}
                  friendlyLabel={friendlyLabel}
                  currentConfig={currentConfig}
                  setCurrentConfig={setCurrentConfig}
                  lockDurationDays={0}
                  setLockDurationDays={() => {}}
                  handleSave={handleSave}
                  isLoading={isLoading}
                  selectedLock={{ isLocked: false, isLockedByMe: false, lockedUntil: null }}
                  hideLocks
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
      </div>
    </div>
  )
}
