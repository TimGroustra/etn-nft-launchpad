import { useQuery } from '@tanstack/react-query'
import { fetchEtnUsdRate } from '@/lib/etn-usd-rate'

const STALE_TIME_MS = 5 * 60 * 1000

export function useEtnUsdRate() {
  return useQuery({
    queryKey: ['etn-usd-rate'],
    queryFn: fetchEtnUsdRate,
    staleTime: STALE_TIME_MS,
    gcTime: STALE_TIME_MS * 2,
    retry: 1,
  })
}
