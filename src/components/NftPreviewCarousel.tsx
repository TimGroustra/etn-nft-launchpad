import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { NftMetadata } from '@/lib/nft-metadata'

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

export function NftPreviewCarousel({ tokens, collectionName }: NftPreviewCarouselProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(0, tokens.length - 1)))
  }, [tokens.length])

  const current = tokens[index]

  const metadataJson = useMemo(
    () => (current ? JSON.stringify(current.metadata, null, 2) : ''),
    [current],
  )

  if (tokens.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
        No complete tokens to preview. Go back to Artwork and add at least one token with a name and image.
      </div>
    )
  }

  const goPrev = () => setIndex((i) => (i === 0 ? tokens.length - 1 : i - 1))
  const goNext = () => setIndex((i) => (i === tokens.length - 1 ? 0 : i + 1))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">
            {collectionName} · Token #{current.tokenId}
          </p>
          <p className="text-xs text-slate-500">
            {index + 1} of {tokens.length} NFT{tokens.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={goPrev} aria-label="Previous NFT">
            Previous
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={goNext} aria-label="Next NFT">
            Next
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            {current.imageUrl ? (
              <img
                src={current.imageUrl}
                alt={current.name}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center text-sm text-slate-500">
                No image
              </div>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {tokens.map((token, i) => (
              <button
                key={token.tokenId}
                type="button"
                onClick={() => setIndex(i)}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border transition-colors ${
                  i === index ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-slate-700 hover:border-slate-500'
                }`}
                aria-label={`Preview token ${token.tokenId}`}
              >
                {token.imageUrl ? (
                  <img src={token.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-slate-900 text-xs text-slate-500">
                    #{token.tokenId}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 p-4">
            <h4 className="font-medium text-white">{current.name}</h4>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              {current.description.trim() || 'No description'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-medium text-white">Metadata JSON</h4>
              <div className="flex items-center gap-2">
                <a
                  href="/templates/token-metadata.template.json"
                  download="token-metadata.template.json"
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Download template
                </a>
                <span className="text-xs text-slate-500">Exact file at publish</span>
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              No royalty wallet fields are included — marketplaces read EIP-2981 from your contract instead.
            </p>
            <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-300">
              {metadataJson}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
