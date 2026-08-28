/** Normalized colour prompts — balanced brightness/saturation across the full set. */

const EXPOSURE_BLOCK = `evenly lit mid-tone exposure, balanced overall brightness matching a unified collection grade, rich saturated neon colours without crushing blacks or blown highlights, high facet detail`

const BACKGROUND_BLOCK = `dark navy to black base with highly vibrant glowing neon circuit board traces clearly visible, colour-matched energetic PCB pattern radiating from center, consistent circuit brightness across collection`

const SHARD_BLOCK = `medium-small centered crystal shard occupying 25-35 percent of frame height, jagged faceted splinter, intense gem luminescence with bloom, vertex star flares, dense sparkle particles, internal lightning veins, no lightning bolt symbol, no text`

const COLOUR_MAP = {
  Blue: {
    gem: 'vivid electric cyan-blue crystal',
    circuits: 'bright neon cyan-blue circuit traces',
  },
  Red: {
    gem: 'vivid bright cherry-red crystal with luminous orange edge highlights, not dark crimson',
    circuits: 'bright neon red-orange circuit traces',
  },
  Orange: {
    gem: 'vivid bright amber-orange gold crystal',
    circuits: 'bright neon orange-gold circuit traces',
  },
  Green: {
    gem: 'vivid bright emerald-green crystal',
    circuits: 'bright neon green circuit traces',
  },
  Purple: {
    gem: 'vivid bright violet-purple magenta crystal',
    circuits: 'bright neon purple-magenta circuit traces',
  },
  Yellow: {
    gem: 'vivid bright golden-yellow crystal',
    circuits: 'bright neon yellow-gold circuit traces',
  },
  Cyan: {
    gem: 'vivid bright aqua-cyan crystal',
    circuits: 'bright neon cyan circuit traces',
  },
  Gold: {
    gem: 'vivid bright metallic gold crystal',
    circuits: 'bright neon gold circuit traces',
  },
  Iridescent: {
    gem: 'vivid iridescent rainbow prism crystal with cyan purple orange refraction',
    circuits: 'bright neon multicolour cyan purple orange circuit traces',
  },
  Prismatic: {
    gem: 'vivid prismatic rainbow crystal with balanced multi-hue refraction',
    circuits: 'bright neon multicolour circuit traces',
  },
  Aurora: {
    gem: 'vivid aurora borealis rainbow crystal shifting green cyan purple pink',
    circuits: 'bright neon aurora multicolour circuit traces',
  },
  Spectrum: {
    gem: 'vivid full-spectrum rainbow crystal with even colour balance',
    circuits: 'bright neon full-spectrum circuit traces',
  },
  Radiant: {
    gem: 'vivid radiant white-core rainbow crystal with saturated edge colours',
    circuits: 'bright neon radiant multicolour circuit traces',
  },
  Pink: {
    gem: 'vivid bright hot pink magenta rose crystal',
    circuits: 'bright neon pink-magenta circuit traces',
  },
  Black: {
    gem: 'vivid bright obsidian-black crystal with electric violet edge highlights',
    circuits: 'bright neon violet-purple circuit traces',
  },
  'Clear/White': {
    gem: 'vivid bright clear white prismatic crystal with soft rainbow edge refraction',
    circuits: 'bright neon white-silver circuit traces',
  },
}

export function resolveColourPrompt(baseColour) {
  return COLOUR_MAP[baseColour] ?? {
    gem: `vivid bright ${baseColour.toLowerCase()} crystal`,
    circuits: `bright neon ${baseColour.toLowerCase()} circuit traces`,
  }
}

export function buildImagePrompt(entry) {
  const { gem, circuits } = resolveColourPrompt(entry.baseColour)
  const cutNote =
    entry.cutEcho && entry.cutEcho !== 'Primal'
      ? `${entry.cutEcho.toLowerCase()} fracture style, `
      : ''
  const fragment = entry.fragmentType.toLowerCase()

  return [
    'Premium NFT digital art, ElectroGem Gem Shard collection.',
    SHARD_BLOCK + '.',
    `${gem}, ${cutNote}${fragment} shape.`,
    circuits + '.',
    BACKGROUND_BLOCK + '.',
    EXPOSURE_BLOCK + '.',
    'Square 1:1 composition.',
  ].join(' ')
}
