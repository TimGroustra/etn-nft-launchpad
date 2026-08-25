const DEFAULT_TREASURY = '0x126aa663BdeDd6Ae477fd28a7d0b624b8109D15d'

function parseExtraAdminWallets(): string[] {
  const raw = Deno.env.get('ADMIN_WALLETS')?.trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((address) => address.startsWith('0x') && address.length === 42)
}

export function isAdminWallet(wallet: string): boolean {
  const treasury = (Deno.env.get('TREASURY_ADDRESS') ?? DEFAULT_TREASURY).toLowerCase()
  const admins = new Set<string>([treasury, ...parseExtraAdminWallets()])
  return admins.has(wallet.toLowerCase())
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
  wallet: string,
): Promise<boolean> {
  return isAdminWallet(wallet) && (await isLaunchpadV2PreviewEnabled(supabase))
}
