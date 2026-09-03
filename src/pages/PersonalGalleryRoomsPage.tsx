import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { ArrowLeft, Copy, Gem, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import type { FunctionsError } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAvailableGems } from '@/hooks/use-available-gems'
import { canEditGallery } from '@/lib/gallery-access'
import { personalGalleryShareUrl } from '@/lib/personal-gallery'
import { supabase } from '@/lib/supabase'

interface PersonalRoom {
  id: string
  slug: string
  display_name: string
  electrogem_token_id: string
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

  const [rooms, setRooms] = useState<PersonalRoom[]>([])
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  const [roomNames, setRoomNames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isConnected || !walletAddress) {
      navigate('/gallery')
      return
    }
    if (!isGemsLoading && !canEdit) {
      toast.error('You need at least one ElectroGem to manage personal gallery rooms.')
      navigate('/gallery')
    }
  }, [isConnected, walletAddress, isGemsLoading, canEdit, navigate])

  const loadRooms = useCallback(async (options?: { silent?: boolean }) => {
    if (!walletAddress) return []
    if (!options?.silent) setLoadingRooms(true)

    const { data, error } = await supabase
      .from('personal_gallery_rooms')
      .select('id, slug, display_name, electrogem_token_id')
      .eq('owner_address', walletAddress.toLowerCase())

    if (error) {
      console.error('[PersonalGalleryRoomsPage] Failed to load rooms:', error)
      if (!options?.silent) {
        toast.error('Could not load your gallery rooms. Refresh and try again.')
      }
      if (!options?.silent) setLoadingRooms(false)
      return []
    }

    const rows = (data as PersonalRoom[] | null) ?? []
    setRooms(rows)
    if (!options?.silent) setLoadingRooms(false)
    return rows
  }, [walletAddress])

  useEffect(() => {
    if (walletAddress && canEdit) {
      void loadRooms()
    }
  }, [walletAddress, canEdit, loadRooms])

  const roomByGem = useMemo(() => {
    const map = new Map<string, PersonalRoom>()
    for (const room of rooms) {
      map.set(String(room.electrogem_token_id), room)
    }
    return map
  }, [rooms])

  const copyShareLink = async (slug: string) => {
    const url = personalGalleryShareUrl(slug)
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Share link copied to clipboard.')
    } catch {
      toast.message(url)
    }
  }

  const handleCreateRoom = async (gemTokenId: string) => {
    if (!walletAddress) return
    const displayName = (roomNames[gemTokenId] ?? '').trim()
    if (displayName.length < 2) {
      toast.error('Enter a room name (at least 2 characters).')
      return
    }

    setCreatingFor(gemTokenId)
    try {
      const { data, error } = await supabase.functions.invoke('gallery-create-room', {
        body: {
          walletAddress,
          displayName,
          electrogemTokenId: String(gemTokenId),
        },
      })

      const payload = (data ?? {}) as CreateRoomResponse
      if (error || payload.error) {
        const message = extractInvokeError(data, error)
        toast.error(message)
        if (message.toLowerCase().includes('already has a personal gallery room')) {
          await loadRooms({ silent: true })
        }
        return
      }

      toast.success('Personal gallery room created.')
      await loadRooms({ silent: true })

      if (payload.roomId) {
        navigate(`/gallery/config/room/${payload.roomId}`)
        return
      }

      const refreshed = await loadRooms({ silent: true })
      const created = refreshed.find((room) => String(room.electrogem_token_id) === String(gemTokenId))
      if (created) {
        navigate(`/gallery/config/room/${created.id}`)
      }
    } catch (e) {
      console.error('[PersonalGalleryRoomsPage] Create room failed:', e)
      toast.error(e instanceof Error ? e.message : 'Failed to create room.')
    } finally {
      setCreatingFor(null)
    }
  }

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
          <h1 className="text-2xl font-bold">My Gallery Rooms</h1>
          <p className="text-sm text-slate-400">
            Each ElectroGem can have one personal gallery room with 10 wall panels and a public share link.
          </p>
        </div>

        {loadingRooms || isGemsLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading your gems…
          </div>
        ) : ownedTokens.length === 0 ? (
          <p className="text-sm text-slate-400">No ElectroGems found in your wallet.</p>
        ) : (
          <div className="space-y-4">
            {ownedTokens.map((tokenId) => {
              const room = roomByGem.get(String(tokenId))
              return (
                <Card key={tokenId} className="border-slate-800 bg-slate-900/80">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Gem className="h-4 w-4 text-cyan-400" />
                      ElectroGem #{tokenId}
                    </CardTitle>
                    <CardDescription>
                      {room ? room.display_name : 'No personal room yet for this gem.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {room ? (
                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm">
                          <Link to={`/gallery/config/room/${room.id}`}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit Panels
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void copyShareLink(room.slug)}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy Link
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="flex-1 space-y-1.5">
                          <Label htmlFor={`room-name-${tokenId}`} className="text-xs">
                            Room name
                          </Label>
                          <Input
                            id={`room-name-${tokenId}`}
                            placeholder="My NFT Lounge"
                            value={roomNames[tokenId] ?? ''}
                            onChange={(e) =>
                              setRoomNames((prev) => ({ ...prev, [tokenId]: e.target.value }))
                            }
                          />
                        </div>
                        <Button
                          size="sm"
                          disabled={creatingFor === tokenId}
                          onClick={() => void handleCreateRoom(tokenId)}
                        >
                          {creatingFor === tokenId ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Create Room
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
