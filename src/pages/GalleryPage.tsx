import { useCallback, useEffect, useState } from 'react'
import { Footprints, Info, Sparkles } from 'lucide-react'
import NftGallery from '@/gallery/NftGallery'
import LoadingSplash from '@/components/gallery/LoadingSplash'
import { nudgeGalleryCacheWorker } from '@/lib/gallery-cache'

export default function GalleryPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [isWalking, setIsWalking] = useState(false)
  const [isStarted, setIsStarted] = useState(false)
  const [highQuality, setHighQuality] = useState(
    () => !window.matchMedia('(max-width: 768px)').matches,
  )

  const handleLoadingComplete = useCallback(() => {
    setIsLoading(false)
  }, [])

  useEffect(() => {
    nudgeGalleryCacheWorker()
    const id = window.setInterval(nudgeGalleryCacheWorker, 45_000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#050505]">
      {isLoading && <LoadingSplash progress={loadingProgress} />}

      <NftGallery
        onLoadingProgress={setLoadingProgress}
        onLoadingComplete={handleLoadingComplete}
        isWalking={isWalking}
        setIsWalking={setIsWalking}
        highQuality={highQuality}
      />

      {!isLoading && !isStarted && (
        <div
          className="absolute inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/80"
          onClick={() => setIsStarted(true)}
        >
          <div className="mx-4 max-w-sm rounded-2xl border border-white/10 bg-[#0b1220]/90 p-8 text-center shadow-2xl backdrop-blur-md">
            <h2 className="mb-2 text-3xl font-black uppercase italic tracking-tight text-cyan-400">3D Gallery</h2>
            <p className="mb-6 text-sm text-white/70">Explore curated NFT collections on Electroneum.</p>
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
              className="w-full rounded-full bg-cyan-500 px-8 py-3 font-bold text-black transition-transform hover:scale-105 active:scale-95"
            >
              Enter Gallery
            </button>
          </div>
        </div>
      )}

      {isStarted && (
        <>
          <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-20 mx-auto max-w-xs rounded border border-white/5 bg-black/40 p-2 text-center text-[10px] text-white backdrop-blur-sm sm:text-xs">
            Drag to look around • Click panels to view in marketplaces
          </div>
          <div className="fixed bottom-16 right-6 z-30 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setHighQuality((v) => !v)}
              className="rounded-full border border-white/10 bg-black/50 p-3 text-white shadow-lg backdrop-blur-md hover:bg-black/70"
              title={highQuality ? 'Switch to performance mode' : 'Switch to full detail'}
            >
              <Sparkles className={`h-5 w-5 ${highQuality ? 'text-cyan-400' : ''}`} />
            </button>
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
