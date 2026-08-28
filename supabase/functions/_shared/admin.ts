const DEFAULT_TREASURY = '0x126aa663BdeDd6Ae477fd28a7d0b624b8109D15d'

function getTreasuryAddress(): string {
  return (Deno.env.get('TREASURY_ADDRESS') ?? DEFAULT_TREASURY).toLowerCase()
}

export function isAdminWallet(wallet: string): boolean {
  return wallet.toLowerCase() === getTreasuryAddress()
}

export async function isLaunchpadV2PreviewEnabled(
  supabase: ReturnType<typeof import('https://esm.sh/@supabase/supabase-js@2.45.0').createClient>,
): Promise<boolean> {
  const { data } = await supabase
    .from('platform_config')
    .select('value')
    .eq('key', 'launchpad_v2_preview_enabled')
    .maybeSingle()
  return data?.value !== 'false'
}

export async function canUseLaunchpadV2(
  supabase: ReturnType<typeof import('https://esm.sh/@supabase/supabase-js@2.45.0').createClient>,
  _wallet: string,
): Promise<boolean> {
  return await isLaunchpadV2PreviewEnabled(supabase)
}

type PublishedCollectionRow = {
  contract_version?: number | null
  status?: string | null
}

export function isPublishedV2Collection(collection: PublishedCollectionRow): boolean {
  return (collection.contract_version ?? 1) !== 1 && collection.status === 'published'
}

export function assertV2MetadataEditable(collection: PublishedCollectionRow, wallet: string) {
  if (isPublishedV2Collection(collection) && !isAdminWallet(wallet)) {
    throw new Error(
      'Published V2 collection metadata cannot be changed. Use the dashboard owner panel for ERC-1155 owner mint and edition caps.',
    )
  }
}
