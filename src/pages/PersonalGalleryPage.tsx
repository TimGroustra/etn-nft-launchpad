import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Footprints, Info } from 'lucide-react'
import NftGallery from '@/gallery/NftGallery'
import LoadingSplash from '@/components/gallery/LoadingSplash'
import { prefetchGalleryConfig } from '@/gallery/galleryConfig'
import { prefetchGalleryPanelCache } from '@/lib/gallery-cache'
import { supabase } from '@/lib/supabase'

const ENTER_GALLERY_FALLBACK_MS = 1500

interface PersonalRoom {
  id: string
  slug: string
  display_name: string
  owner_address: string
}

export default function PersonalGalleryPage() {
  const { slug = '' } = useParams()
  const [room, setRoom] = useState<PersonalRoom | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingMessage, setLoadingMessage] = useState('Loading gallery room…')
  const [hasFirstImage, setHasFirstImage] = useState(false)
  const [allowEnterWithoutImage, setAllowEnterWithoutImage] = useState(false)
  const [isWalking, setIsWalking] = useState(false)
  const [isStarted, setIsStarted] = useState(false)

  useEffect(() => {
    if (!slug) {
      setNotFound(true)
      return
    }
    const loadRoom = async () => {
      const { data } = await supabase
        .from('personal_gallery_rooms')
        .select('id, slug, display_name, owner_address')
        .eq('slug', slug)
        .maybeSingle()

      if (!data) {
        setNotFound(true)
        return
      }
      setRoom(data as PersonalRoom)
    }
    void loadRoom()
  }, [slug])

  useEffect(() => {
    if (!room) return
    prefetchGalleryPanelCache({ roomId: room.id })
    prefetchGalleryConfig({ layout: 'personal', roomId: room.id })
    const enterFallbackId = window.setTimeout(
      () => setAllowEnterWithoutImage(true),
      ENTER_GALLERY_FALLBACK_MS,
    )
    return () => {
      window.clearTimeout(enterFallbackId)
    }
  }, [room])

  const handleLoadingComplete = useCallback(() => {
    setIsLoading(false)
  }, [])

  const handleFirstImageLoaded = useCallback(() => {
    setHasFirstImage(true)
  }, [])

  if (notFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center text-white">
        <h1 className="text-2xl font-bold">Gallery room not found</h1>
        <p className="text-sm text-slate-400">This share link may be invalid or the room was removed.</p>
        <Link to="/gallery" className="text-cyan-400 underline">
          Visit main gallery
        </Link>
      </div>
    )
  }

  if (!room) {
    return <LoadingSplash progress={20} message="Finding gallery room…" />
  }

  const canEnterGallery = hasFirstImage || allowEnterWithoutImage

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#050505]">
      {isLoading && <LoadingSplash progress={loadingProgress} message={loadingMessage} />}

      <NftGallery
        layout="personal"
        roomId={room.id}
        roomDisplayName={room.display_name}
        onLoadingProgress={setLoadingProgress}
        onLoadingMessage={setLoadingMessage}
        onLoadingComplete={handleLoadingComplete}
        onFirstImageLoaded={handleFirstImageLoaded}
        isWalking={isWalking}
        setIsWalking={setIsWalking}
      />

      {!isLoading && !isStarted && (
        <div
          className="absolute inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/80"
          onClick={() => canEnterGallery && setIsStarted(true)}
        >
          <div className="mx-4 max-w-sm rounded-2xl border border-white/10 bg-[#0b1220]/90 p-8 text-center shadow-2xl backdrop-blur-md">
            <h2 className="mb-2 text-3xl font-black uppercase italic tracking-tight text-cyan-400">
              {room.display_name}
            </h2>
            <p className="mb-6 text-sm text-white/70">A personal ElectroGem gallery room.</p>
            <div className="mb-6 space-y-3 border-t border-white/5 pt-4 text-left">
              <p className="flex items-center gap-2 text-xs text-white/60">
                <Info className="h-4 w-4 shrink-0 text-cyan-400" />
                <span>Drag to look around in 360°</span>
              </p>
              <p className="flex items-center gap-2 text-xs text-white/60">
                <Footprints className="h-4 w-4 shrink-0 text-cyan-400" />
                <span>WASD / Arrow Keys or the Walk button to move</span>
              </p>
              <p className="text-xs text-white/60">Tap gallery panels to open marketplace listings.</p>
            </div>
            <button
              type="button"
              disabled={!canEnterGallery}
              className={`w-full rounded-full px-8 py-3 font-bold transition-transform ${
                canEnterGallery
                  ? 'bg-cyan-500 text-black hover:scale-105 active:scale-95'
                  : 'cursor-wait bg-cyan-500/40 text-black/60'
              }`}
            >
              {canEnterGallery
                ? allowEnterWithoutImage && !hasFirstImage
                  ? 'Continue anyway'
                  : 'Enter Room'
                : 'Loading artwork…'}
            </button>
          </div>
        </div>
      )}

      {isStarted && (
        <>
          <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-20 mx-auto max-w-xs rounded border border-white/5 bg-black/40 p-2 text-center text-[10px] text-white backdrop-blur-sm sm:text-xs">
            {room.display_name} · Drag to look · Click panels for marketplaces
          </div>
          <div className="fixed bottom-16 right-6 z-30">
            <button
              type="button"
              onClick={() => setIsWalking(!isWalking)}
              className={`rounded-full border border-white/10 p-4 shadow-lg transition-all ${
                isWalking
                  ? 'scale-110 bg-cyan-500 text-black shadow-cyan-500/20'
                  : 'bg-black/50 text-white backdrop-blur-md hover:bg-black/70'
              }`}
              title="Toggle walking forward"
            >
              <Footprints className={`h-7 w-7 ${isWalking ? 'animate-pulse' : ''}`} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
