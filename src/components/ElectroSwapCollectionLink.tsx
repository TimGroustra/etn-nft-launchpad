import { ExternalLink } from 'lucide-react'
import { ELECTROSWAP_EXTERNAL_LINK_PROPS, getElectroSwapCollectionUrl } from '@/lib/marketplace'

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
      {...ELECTROSWAP_EXTERNAL_LINK_PROPS}
      onClick={(event) => event.stopPropagation()}
      className={className ?? 'inline-flex items-center gap-1 text-blue-400 hover:underline'}
    >
      View on ElectroSwap
      {showIcon ? <ExternalLink className="h-3.5 w-3.5" /> : null}
    </a>
  )
}
