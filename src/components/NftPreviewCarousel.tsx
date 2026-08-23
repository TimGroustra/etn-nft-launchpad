import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NftMetadata } from '@/lib/nft-metadata'
import { cn } from '@/lib/utils'

export type NftPreviewItem = {
  tokenId: number
  name: string
  description: string
  imageUrl: string | null
  metadata: NftMetadata
}

type NftPreviewCarouselProps = {
  tokens: NftPreviewItem[]
  collectionName: string
}

const SWIPE_THRESHOLD_PX = 48

export function NftPreviewCarousel({ tokens, collectionName }: NftPreviewCarouselProps) {
  const [index, setIndex] = useState(0)
  const [metadataOpen, setMetadataOpen] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const thumbStripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(0, tokens.length - 1)))
  }, [tokens.length])

  useEffect(() => {
    setMetadataOpen(false)
  }, [index])

  useEffect(() => {
    const strip = thumbStripRef.current
    if (!strip) return
    const thumb = strip.children[index] as HTMLElement | undefined
    thumb?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [index])

  const current = tokens[index]

  const metadataJson = useMemo(
    () => (current ? JSON.stringify(current.metadata, null, 2) : ''),
    [current],
  )

  if (tokens.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400 sm:p-8">
        No complete tokens to preview. Go back to Artwork and add at least one token with a name and image.
      </div>
    )
  }

  const goPrev = () => setIndex((i) => (i === 0 ? tokens.length - 1 : i - 1))
  const goNext = () => setIndex((i) => (i === tokens.length - 1 ? 0 : i + 1))

  const onTouchStart = (clientX: number) => {
    touchStartX.current = clientX
  }

  const onTouchEnd = (clientX: number) => {
    if (touchStartX.current == null) return
    const delta = clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return
    if (delta > 0) goPrev()
    else goNext()
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white sm:text-base">
            {collectionName} · #{current.tokenId}
          </p>
          <p className="text-xs text-slate-500">
            {index + 1} of {tokens.length}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={goPrev}
            aria-label="Previous NFT"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={goNext}
            aria-label="Next NFT"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        className="relative touch-pan-y"
        onTouchStart={(e) => onTouchStart(e.touches[0]?.clientX ?? 0)}
        onTouchEnd={(e) => onTouchEnd(e.changedTouches[0]?.clientX ?? 0)}
      >
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
          {current.imageUrl ? (
            <img
              src={current.imageUrl}
              alt={current.name}
              className="mx-auto aspect-square max-h-[min(70vh,28rem)] w-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex aspect-square max-h-[min(70vh,28rem)] items-center justify-center text-sm text-slate-500">
              No image
            </div>
          )}
        </div>

        {tokens.length > 1 && (
          <>
            <button
              type="button"
              className="absolute top-1/2 left-1 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700/80 bg-slate-950/80 text-white backdrop-blur-sm transition hover:bg-slate-900 sm:flex"
              onClick={goPrev}
              aria-label="Previous NFT"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="absolute top-1/2 right-1 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700/80 bg-slate-950/80 text-white backdrop-blur-sm transition hover:bg-slate-900 sm:flex"
              onClick={goNext}
              aria-label="Next NFT"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {tokens.length > 1 && (
        <div
          ref={thumbStripRef}
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scroll-smooth snap-x snap-mandatory [scrollbar-width:thin]"
        >
          {tokens.map((token, i) => (
            <button
              key={token.tokenId}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                'relative h-14 w-14 shrink-0 snap-center overflow-hidden rounded-lg border transition-colors sm:h-16 sm:w-16',
                i === index ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-slate-700 hover:border-slate-500',
              )}
              aria-label={`Preview token ${token.tokenId}`}
              aria-current={i === index ? 'true' : undefined}
            >
              {token.imageUrl ? (
                <img src={token.imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-slate-900 text-xs text-slate-500">
                  #{token.tokenId}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        <div className="rounded-xl border border-slate-800 p-4">
          <h4 className="text-base font-medium text-white">{current.name}</h4>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            {current.description.trim() || 'No description'}
          </p>
          {current.metadata.attributes.length > 0 && (
            <dl className="mt-4 grid gap-2 border-t border-slate-800 pt-4 text-sm">
              {current.metadata.attributes.map((attr) => (
                <div
                  key={attr.trait_type}
                  className="grid gap-0.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-4"
                >
                  <dt className="text-slate-400">{attr.trait_type}</dt>
                  <dd className="break-words text-white sm:text-right">{String(attr.value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 p-4">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setMetadataOpen((open) => !open)}
            aria-expanded={metadataOpen}
          >
            <h4 className="font-medium text-white">Metadata JSON</h4>
            <span className="shrink-0 text-xs text-slate-500">{metadataOpen ? 'Hide' : 'Show'}</span>
          </button>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Exact file at publish. Includes royalty fields for marketplaces.
          </p>
          {metadataOpen && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <a
                  href="/templates/token-metadata.template.json"
                  download="token-metadata.template.json"
                  className="text-blue-400 hover:text-blue-300"
                >
                  Download template
                </a>
              </div>
              <pre className="mt-3 max-h-[min(40vh,16rem)] overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-300 sm:max-h-64 sm:text-xs">
                {metadataJson}
              </pre>
            </>
          )}
        </div>
      </div>

      {tokens.length > 1 && (
        <p className="text-center text-xs text-slate-500 sm:hidden">Swipe the image left or right to change token</p>
      )}
    </div>
  )
}
