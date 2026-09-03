import { PERSONAL_PANEL_SLOTS, personalPanelKey } from '@/lib/personal-gallery'
import { PERSONAL_LAYOUT, getPersonalPanelPlacements } from '@/gallery/layouts/galleryLayouts'

export { PERSONAL_LAYOUT, getPersonalPanelPlacements }

export function personalPanelKeys(roomId: string): string[] {
  return PERSONAL_PANEL_SLOTS.map((slot) => personalPanelKey(roomId, slot))
}

export function personalFriendlyLabel(panelKey: string): string {
  const slot = panelKey.split(':').pop() ?? panelKey
  const match = slot.match(/^(north|south|east|west)-wall-(\d+)$/)
  if (!match) return slot
  const wall = match[1].charAt(0).toUpperCase() + match[1].slice(1)
  return `${wall} Wall Panel ${Number(match[2]) + 1}`
}
