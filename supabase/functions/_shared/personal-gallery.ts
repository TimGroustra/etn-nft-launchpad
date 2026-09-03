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

export function personalPanelKey(roomId: string, slot: string): string {
  return `r:${roomId}:${slot}`
}

export function parsePersonalPanelKey(panelKey: string): { roomId: string; slot: string } | null {
  const match = panelKey.match(/^r:([0-9a-f-]{36}):(.+)$/i)
  if (!match) return null
  return { roomId: match[1], slot: match[2] }
}

export function slugifyRoomName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'my-gallery'
}

export async function uniqueRoomSlug(
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: unknown }>
        }
      }
    }
  },
  baseSlug: string,
): Promise<string> {
  let slug = baseSlug
  let suffix = 0
  while (true) {
    const { data } = await supabase.from('personal_gallery_rooms').select('id').eq('slug', slug).maybeSingle()
    if (!data) return slug
    suffix += 1
    slug = `${baseSlug}-${suffix}`
  }
}
