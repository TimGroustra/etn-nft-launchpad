export type GalleryLayoutPreset = 'main' | 'personal'

export const MAIN_LAYOUT = {
  preset: 'main' as const,
  roomSegmentSize: 10,
  numSegments: 5,
  roomSize: 50,
  wallHeight: 16,
  lowerWallHeight: 8,
  lowerPanelY: 5.0,
  innerLowerPanelY: 4.0,
  upperPanelY: 12.0,
  wallThickness: 0.5,
  boundary: 24,
}

export const PERSONAL_LAYOUT = {
  preset: 'personal' as const,
  roomWidth: 30,
  roomDepth: 20,
  wallHeight: 12,
  panelY: 5.0,
  wallThickness: 0.5,
  pitWidth: 12,
  pitDepth: 8,
  pitDepthY: 2.5,
  boundaryX: 14,
  boundaryZ: 9,
  segmentSize: 10,
}

export type PersonalPanelPlacement = {
  slot: string
  x: number
  z: number
  rotationY: number
  dx: number
  dz: number
}

/** Panel positions for 30×20 room: 3 segments on N/S, 2 on E/W. */
export function getPersonalPanelPlacements(): PersonalPanelPlacement[] {
  const halfW = PERSONAL_LAYOUT.roomWidth / 2
  const halfD = PERSONAL_LAYOUT.roomDepth / 2
  const dOff = 0.15 + PERSONAL_LAYOUT.wallThickness / 2
  const northSouthX = [-10, 0, 10]
  const eastWestZ = [-5, 5]
  const placements: PersonalPanelPlacement[] = []

  northSouthX.forEach((x, i) => {
    placements.push({
      slot: `north-wall-${i}`,
      x,
      z: -halfD,
      rotationY: 0,
      dx: 0,
      dz: dOff,
    })
    placements.push({
      slot: `south-wall-${i}`,
      x,
      z: halfD,
      rotationY: Math.PI,
      dx: 0,
      dz: -dOff,
    })
  })

  eastWestZ.forEach((z, i) => {
    placements.push({
      slot: `east-wall-${i}`,
      x: halfW,
      z,
      rotationY: -Math.PI / 2,
      dx: -dOff,
      dz: 0,
    })
    placements.push({
      slot: `west-wall-${i}`,
      x: -halfW,
      z,
      rotationY: Math.PI / 2,
      dx: dOff,
      dz: 0,
    })
  })

  return placements
}
