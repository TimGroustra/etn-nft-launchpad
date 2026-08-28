import { ExternalLink } from 'lucide-react'
import { getElectroSwapCollectionUrl } from '@/lib/marketplace'

type ElectroSwapCollectionLinkProps = {
  contractAddress: string
  className?: string
  showIcon?: boolean
}

export function ElectroSwapCollectionLink({
  contractAddress,
  className,
  showIcon = false,
}: ElectroSwapCollectionLinkProps) {
  return (
    <a
      href={getElectroSwapCollectionUrl(contractAddress)}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? 'inline-flex items-center gap-1 text-blue-400 hover:underline'}
    >
      View on ElectroSwap
      {showIcon ? <ExternalLink className="h-3.5 w-3.5" /> : null}
    </a>
  )
}
