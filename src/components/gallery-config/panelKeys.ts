export type OuterFloor = 'ground' | 'first'

const OUTER_WALLS = ['north', 'south', 'east', 'west'] as const
const OUTER_INDICES = [0, 1, 2, 3, 4] as const

const GROUND_INNER_PANELS = [
  'north-inner-wall-outer-0',
  'north-inner-wall-inner-0',
  'north-inner-wall-outer-1',
  'north-inner-wall-inner-1',
  'south-inner-wall-inner-0',
  'south-inner-wall-outer-0',
  'south-inner-wall-inner-1',
  'south-inner-wall-outer-1',
  'west-inner-wall-outer-0',
  'west-inner-wall-inner-0',
  'west-inner-wall-outer-1',
  'west-inner-wall-inner-1',
  'east-inner-wall-inner-0',
  'east-inner-wall-outer-0',
  'east-inner-wall-inner-1',
  'east-inner-wall-outer-1',
] as const

export function outerPanelKeys(floor: OuterFloor): string[] {
  const keys: string[] = []
  for (const wall of OUTER_WALLS) {
    for (const index of OUTER_INDICES) {
      keys.push(`${wall}-wall-${index}-${floor}`)
    }
  }
  return keys
}

export function panelKeysForFloor(floor: OuterFloor): string[] {
  if (floor === 'ground') {
    return [...outerPanelKeys(floor), ...GROUND_INNER_PANELS]
  }
  return outerPanelKeys(floor)
}

export function panelSectionLabel(key: string): string {
  if (key.includes('-inner-')) return 'Inner walls'
  const wall = key.split('-')[0]
  return `${wall.charAt(0).toUpperCase()}${wall.slice(1)} wall`
}
