import type { Collection } from '@/types/database'

export function filterMintPanelCollections<T extends Pick<Collection, 'mint_panel_admin_only'>>(
  collections: T[],
  isAdmin: boolean,
): T[] {
  return collections.filter((collection) => !collection.mint_panel_admin_only || isAdmin)
}
