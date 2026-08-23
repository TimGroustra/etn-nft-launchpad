import { cn } from '@/lib/utils'
import { etnToUsd, formatUsd } from '@/lib/etn-usd-rate'
import { useEtnUsdRate } from '@/hooks/useEtnUsdRate'

type EtnUsdHintProps = {
  etn: number | string
  className?: string
  align?: 'left' | 'right'
}

export function EtnUsdHint({
  etn,
  className,
  align = 'left',
}: EtnUsdHintProps) {
  const { data: usdPerEtn, isLoading, isError } = useEtnUsdRate()
  const etnAmount = Number(etn)

  if (!Number.isFinite(etnAmount) || etnAmount <= 0) return null

  if (isLoading) {
    return (
      <p className={cn('text-xs text-slate-500', align === 'right' && 'text-right', className)}>
        Loading USD rate…
      </p>
    )
  }

  if (isError || !usdPerEtn) return null

  const usdAmount = etnToUsd(etnAmount, usdPerEtn)

  return (
    <p className={cn('text-xs text-slate-400', align === 'right' && 'text-right', className)}>
      ≈ {formatUsd(usdAmount)} USD
    </p>
  )
}
