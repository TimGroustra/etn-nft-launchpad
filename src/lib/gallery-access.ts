/** Anyone can browse the 3D gallery. */
export function canViewGallery(): boolean {
  return true
}

/** ElectroGem holders (≥1) can configure gallery panels. */
export function canEditGallery(ownedGemCount: number): boolean {
  return ownedGemCount >= 1
}
