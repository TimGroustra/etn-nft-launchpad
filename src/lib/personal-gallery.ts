/** Fixed panel slots in a personal gallery room (single floor). */
export const PERSONAL_PANEL_SLOTS = [
  'north-wall-0',
  'north-wall-1',
  'north-wall-2',
  'south-wall-0',
  'south-wall-1',
  'south-wall-2',
  'east-wall-0',
  'east-wall-1',
  'west-wall-0',
  'west-wall-1',
] as const

export type PersonalPanelSlot = (typeof PERSONAL_PANEL_SLOTS)[number]

export function personalPanelKey(roomId: string, slot: string): string {
  return `r:${roomId}:${slot}`
}

export function parsePersonalPanelKey(panelKey: string): { roomId: string; slot: string } | null {
  const match = panelKey.match(/^r:([0-9a-f-]{36}):(.+)$/i)
  if (!match) return null
  return { roomId: match[1], slot: match[2] }
}

export function isPersonalPanelKey(panelKey: string): boolean {
  return panelKey.startsWith('r:')
}

export function personalGalleryShareUrl(slug: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/gallery/room/${slug}`
}

export function personalGalleryRoomTitle(displayName: string): string {
  const trimmed = displayName.trim()
  if (!trimmed) return 'Gallery Room'
  return `${trimmed} Gallery Room`
}

export function slugifyRoomName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'my-gallery'
}
