import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { CREATOR_ACCESS_COLLECTIONS } from '@/lib/creator-access'

export function CreatorAccessUpsell() {
  return (
    <Card className="border-blue-500/30 bg-gradient-to-br from-slate-900 to-slate-950 p-6">
      <CardTitle className="text-xl">Create NFT collections on Electroneum</CardTitle>
      <CardDescription className="mt-2 max-w-2xl text-slate-300">
        To launch your own collection on the ETN NFT Launchpad, your wallet must hold at least one{' '}
        <strong className="font-medium text-white">ElectroGem</strong> or{' '}
        <strong className="font-medium text-white">Club Watch</strong> NFT. Hold both for a 50% discount on the
        publish fee.
      </CardDescription>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {CREATOR_ACCESS_COLLECTIONS.map((collection) => (
          <div
            key={collection.key}
            className="flex flex-col justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4"
          >
            <div>
              <p className="font-medium text-white">{collection.label}</p>
              <p className="mt-1 text-sm text-slate-400">Purchase on ElectroSwap to unlock creator access.</p>
            </div>
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <a href={collection.marketUrl} target="_blank" rel="noopener noreferrer">
                Buy {collection.label}
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        ))}
      </div>
    </Card>
  )
}
