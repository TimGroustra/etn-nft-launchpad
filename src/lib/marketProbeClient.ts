import { getAddress, isAddress } from 'viem'
import { supabase } from '@/lib/supabase'

export type ProbeStatus = 'available' | 'unavailable' | 'unverified' | 'checking'

export interface ProbeResponse {
  status: ProbeStatus
  reason?: string
  probe?: string
  url?: string
}

const PROBE_TIMEOUT_MS = 12_000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Probe timeout')), timeoutMs)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

function normalizeProbeResponse(data: unknown): ProbeResponse {
  if (!data || typeof data !== 'object') {
    return { status: 'unverified', reason: 'empty-response' }
  }

  const status = (data as ProbeResponse).status
  if (status === 'available' || status === 'unavailable' || status === 'unverified') {
    return data as ProbeResponse
  }

  return { status: 'unverified', reason: 'invalid-response' }
}

export async function probeMarketplaceServerSide(
  marketplace: string,
  collection: string,
  tokenId: string | number,
): Promise<ProbeResponse> {
  const normalizedCollection = isAddress(collection) ? getAddress(collection) : collection

  try {
    const { data, error } = await withTimeout(
      supabase.functions.invoke('market-probe', {
        method: 'POST',
        body: { marketplace, collection: normalizedCollection, tokenId: String(tokenId) },
      }),
      PROBE_TIMEOUT_MS,
    )

    if (error) return { status: 'unverified', reason: error.message }
    return normalizeProbeResponse(data)
  } catch (e) {
    return { status: 'unverified', reason: String(e) }
  }
}
