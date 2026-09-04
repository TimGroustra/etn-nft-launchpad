import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { ArrowLeft, Copy, ExternalLink, Gem, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import type { FunctionsError } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAvailableGems } from '@/hooks/use-available-gems'
import { canEditGallery } from '@/lib/gallery-access'
import { personalGalleryShareUrl, personalGalleryRoomTitle } from '@/lib/personal-gallery'
import { supabase } from '@/lib/supabase'

interface PersonalRoom {
  id: string
  slug: string
  display_name: string
}

interface CreateRoomResponse {
  success?: boolean
  roomId?: string
  slug?: string
  displayName?: string
  shareUrl?: string
  error?: string
}

function extractInvokeError(data: unknown, error: FunctionsError | null): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const message = (data as { error?: unknown }).error
    if (typeof message === 'string' && message.trim()) return message
  }
  if (error?.message) return error.message
  return 'Failed to create room.'
}

export default function PersonalGalleryRoomsPage() {
  const navigate = useNavigate()
  const { address: walletAddress, isConnected } = useAccount()
  const { ownedTokens, isLoading: isGemsLoading } = useAvailableGems(walletAddress || null)
  const canEdit = canEditGallery(ownedTokens.length)

  const [room, setRoom] = useState<PersonalRoom | null>(null)
  const [loadingRoom, setLoadingRoom] = useState(true)
  const [creating, setCreating] = useState(false)
  const [roomName, setRoomName] = useState('')

  useEffect(() => {
    if (!isConnected || !walletAddress) {
      navigate('/gallery')
      return
    }
    if (!isGemsLoading && !canEdit) {
      toast.error('You need at least one ElectroGem to manage a personal gallery room.')
      navigate('/gallery')
    }
  }, [isConnected, walletAddress, isGemsLoading, canEdit, navigate])

  const loadRoom = useCallback(async (options?: { silent?: boolean }) => {
    if (!walletAddress) return null
    if (!options?.silent) setLoadingRoom(true)

    const { data, error } = await supabase
      .from('personal_gallery_rooms')
      .select('id, slug, display_name')
      .eq('owner_address', walletAddress.toLowerCase())
      .maybeSingle()

    if (error) {
      console.error('[PersonalGalleryRoomsPage] Failed to load room:', error)
      if (!options?.silent) {
        toast.error('Could not load your gallery room. Refresh and try again.')
      }
      if (!options?.silent) setLoadingRoom(false)
      return null
    }

    const row = (data as PersonalRoom | null) ?? null
    setRoom(row)
    if (!options?.silent) setLoadingRoom(false)
    return row
  }, [walletAddress])

  useEffect(() => {
    if (walletAddress && canEdit) {
      void loadRoom()
    }
  }, [walletAddress, canEdit, loadRoom])

  const copyShareLink = async (slug: string) => {
    const url = personalGalleryShareUrl(slug)
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Public gallery link copied.')
    } catch {
      toast.message(url)
    }
  }

  const handleCreateRoom = async () => {
    if (!walletAddress) return
    const displayName = roomName.trim()
    if (displayName.length < 2) {
      toast.error('Enter a room name (at least 2 characters).')
      return
    }

    setCreating(true)
    try {
      const { data, error } = await supabase.functions.invoke('gallery-create-room', {
        body: {
          walletAddress,
          displayName,
        },
      })

      const payload = (data ?? {}) as CreateRoomResponse
      if (error || payload.error) {
        const message = extractInvokeError(data, error)
        toast.error(message)
        if (message.toLowerCase().includes('already has a personal gallery room')) {
          await loadRoom({ silent: true })
        }
        return
      }

      toast.success('Personal gallery room created.')
      const refreshed = await loadRoom({ silent: true })

      if (payload.roomId) {
        navigate(`/gallery/config/room/${payload.roomId}`)
        return
      }
      if (refreshed) {
        navigate(`/gallery/config/room/${refreshed.id}`)
      }
    } catch (e) {
      console.error('[PersonalGalleryRoomsPage] Create room failed:', e)
      toast.error(e instanceof Error ? e.message : 'Failed to create room.')
    } finally {
      setCreating(false)
    }
  }

  const publicUrl = room ? personalGalleryShareUrl(room.slug) : null

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-slate-950 p-3 text-white sm:p-6 lg:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-10 w-fit px-0 text-sm hover:bg-transparent"
        >
          <Link to="/gallery/config">
            <ArrowLeft className="mr-2 h-4 w-4" /> Configure Hub
          </Link>
        </Button>

        <div>
          <h1 className="text-2xl font-bold">My Gallery Room</h1>
          <p className="text-sm text-slate-400">
            One personal 10-panel gallery per wallet. Anyone can view your public link — no wallet required.
          </p>
        </div>

        {loadingRoom || isGemsLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : ownedTokens.length === 0 ? (
          <p className="text-sm text-slate-400">No ElectroGems found in your wallet.</p>
        ) : room ? (
          <Card className="border-slate-800 bg-slate-900/80">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gem className="h-4 w-4 text-cyan-400" />
                {personalGalleryRoomTitle(room.display_name)}
              </CardTitle>
              <CardDescription>
                Edit your panels, then share the public gallery link below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to={`/gallery/config/room/${room.id}`}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Panels
                  </Link>
                </Button>
                <Button size="sm" variant="outline" onClick={() => void copyShareLink(room.slug)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy room link
                </Button>
                {publicUrl && (
                  <Button asChild size="sm" variant="outline">
                    <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open room
                    </a>
                  </Button>
                )}
              </div>
              {publicUrl && (
                <p className="break-all text-xs text-slate-500">{publicUrl}</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-slate-800 bg-slate-900/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Create your gallery room</CardTitle>
              <CardDescription>
                You hold {ownedTokens.length} ElectroGem{ownedTokens.length === 1 ? '' : 's'}. Set a name to get your public share link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="room-name" className="text-xs">
                    Room name
                  </Label>
                  <Input
                    id="room-name"
                    placeholder="My NFT Lounge"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                  />
                </div>
                <Button size="sm" disabled={creating} onClick={() => void handleCreateRoom()}>
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create Room
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
