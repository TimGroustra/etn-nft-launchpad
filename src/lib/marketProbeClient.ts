import { supabase } from '@/lib/supabase'

export type ProbeStatus = 'available' | 'unavailable' | 'error' | 'checking'

export interface ProbeResponse {
  status: ProbeStatus
  reason?: string
  probe?: string
  url?: string
}

export async function probeMarketplaceServerSide(
  marketplace: string,
  collection: string,
  tokenId: string | number,
): Promise<ProbeResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('market-probe', {
      method: 'POST',
      body: { marketplace, collection, tokenId: String(tokenId) },
    })

    if (error) return { status: 'error', reason: error.message }
    return data as ProbeResponse
  } catch (e) {
    return { status: 'error', reason: String(e) }
  }
}
