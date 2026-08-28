import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

/** Header link to the Gem Shard rewards page — visible to everyone. */
export function GemShardClaimButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      asChild
      className="h-7 shrink-0 border-emerald-800/60 px-2 text-xs text-emerald-300 hover:bg-emerald-950/40 sm:h-8 sm:px-3 sm:text-sm"
    >
      <Link to="/rewards" title="Gem Shard holder rewards">
        Rewards
      </Link>
    </Button>
  )
}
