/** Default true during preview; set VITE_GALLERY_TREASURY_PREVIEW=false to launch publicly. */
export const GALLERY_TREASURY_PREVIEW =
  import.meta.env.VITE_GALLERY_TREASURY_PREVIEW !== 'false'

export function canViewGallery(_wallet: string | null | undefined, isAdmin: boolean): boolean {
  if (GALLERY_TREASURY_PREVIEW) return isAdmin
  return true
}

export function canEditGallery(
  _wallet: string | null | undefined,
  isAdmin: boolean,
  ownedGemCount: number,
): boolean {
  if (GALLERY_TREASURY_PREVIEW) return isAdmin
  return ownedGemCount >= 1
}
