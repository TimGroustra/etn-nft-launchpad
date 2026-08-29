import { ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { CREATOR_ACCESS_COLLECTIONS } from '@/lib/creator-access'
import { ELECTROSWAP_EXTERNAL_LINK_PROPS } from '@/lib/marketplace'

type HolderPerksCardProps = {
  onDismiss?: () => void
}

export function HolderPerksCard({ onDismiss }: HolderPerksCardProps) {
  return (
    <Card className="relative border-blue-500/30 bg-gradient-to-br from-slate-900 to-slate-950 p-6">
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-3 top-3 rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
          aria-label="Dismiss holder perks"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <CardTitle className="text-xl">Holder perks</CardTitle>
      <CardDescription className="mt-2 max-w-2xl text-slate-300">
        Anyone can create collections on the ETN NFT Launchpad. If you hold both an{' '}
        <strong className="font-medium text-white">ElectroGem</strong> and a{' '}
        <strong className="font-medium text-white">Club Watch</strong> NFT, you unlock:
      </CardDescription>
      <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-slate-300">
        <li>No platform mint fee on launchpad mints</li>
        <li>50% off tiered publish fees</li>
        <li>Optional CLUB burns on mints and resales</li>
        <li>50% off Gem Shards paid mints</li>
        <li>A share of launchpad mint fees and publish fees via Gem Shards</li>
      </ul>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {CREATOR_ACCESS_COLLECTIONS.map((collection) => (
          <div
            key={collection.key}
            className="flex flex-col justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4"
          >
            <div>
              <p className="font-medium text-white">{collection.label}</p>
              <p className="mt-1 text-sm text-slate-400">Hold both collections to unlock all perks.</p>
            </div>
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <a href={collection.marketUrl} {...ELECTROSWAP_EXTERNAL_LINK_PROPS}>
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
