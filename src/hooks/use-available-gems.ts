import { useCallback, useEffect, useMemo, useState } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import {
  CREATOR_ACCESS_CHAIN_ID,
  ELECTROGEMS_NFT_ADDRESS,
  ERC721_ENUMERABLE_ABI,
} from '@/lib/creator-access'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type PanelLockGemRow = Pick<
  Database['public']['Tables']['panel_locks']['Row'],
  'locking_gem_token_id'
>

interface AvailableGemsResult {
  availableTokens: string[]
  ownedTokens: string[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

const MAX_GEMS = 20

export function useAvailableGems(walletAddress: string | null | undefined): AvailableGemsResult {
  const [lockedTokenIds, setLockedTokenIds] = useState<Set<string>>(new Set())
  const [locksLoading, setLocksLoading] = useState(true)
  const [locksError, setLocksError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const owner = walletAddress as `0x${string}` | undefined

  const { data: balance, isLoading: balanceLoading, error: balanceError } = useReadContract({
    address: ELECTROGEMS_NFT_ADDRESS,
    abi: ERC721_ENUMERABLE_ABI,
    functionName: 'balanceOf',
    args: owner ? [owner] : undefined,
    chainId: CREATOR_ACCESS_CHAIN_ID,
    query: { enabled: Boolean(owner), staleTime: 30_000 },
  })

  const ownedIndexCount = Math.min(Number(balance ?? 0n), MAX_GEMS)

  const ownedTokenContracts = useMemo(
    () =>
      !owner || ownedIndexCount === 0
        ? []
        : Array.from({ length: ownedIndexCount }, (_, index) => ({
            address: ELECTROGEMS_NFT_ADDRESS,
            abi: ERC721_ENUMERABLE_ABI,
            functionName: 'tokenOfOwnerByIndex' as const,
            args: [owner, BigInt(index)] as const,
            chainId: CREATOR_ACCESS_CHAIN_ID,
          })),
    [owner, ownedIndexCount],
  )

  const {
    data: ownedTokenResults,
    isLoading: ownedTokensLoading,
    error: ownedTokensError,
  } = useReadContracts({
    contracts: ownedTokenContracts,
    query: {
      enabled: Boolean(owner) && ownedIndexCount > 0,
      staleTime: 30_000,
    },
  })

  const ownedTokens = useMemo(() => {
    if (!ownedTokenResults) return []
    return ownedTokenResults
      .filter((result) => result.status === 'success')
      .map((result) => String(result.result))
  }, [ownedTokenResults])

  const fetchLocks = useCallback(async () => {
    setLocksLoading(true)
    setLocksError(null)
    try {
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('panel_locks')
        .select('locking_gem_token_id')
        .gt('locked_until', now)

      if (error) throw error
      const ids = new Set(
        ((data ?? []) as PanelLockGemRow[])
          .map((row) => row.locking_gem_token_id)
          .filter((id): id is string => Boolean(id)),
      )
      setLockedTokenIds(ids)
    } catch (e) {
      setLocksError(e instanceof Error ? e.message : 'Failed to load panel locks')
      setLockedTokenIds(new Set())
    } finally {
      setLocksLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchLocks()
  }, [fetchLocks, refreshKey])

  const availableTokens = useMemo(
    () => ownedTokens.filter((id) => !lockedTokenIds.has(id)),
    [ownedTokens, lockedTokenIds],
  )

  const error =
    balanceError?.message ??
    ownedTokensError?.message ??
    locksError ??
    null

  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return {
    availableTokens,
    ownedTokens,
    isLoading: Boolean(owner) && (balanceLoading || ownedTokensLoading || locksLoading),
    error,
    refetch,
  }
}
