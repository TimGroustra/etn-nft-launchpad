import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchElectroGems } from './fetch-electrogems.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../gem-shards')
const SHARDS_PER_PARENT = 10
const PRIMAL_COUNT = 5
const PRIMAL_SHARE_WEIGHT = 2
const NORMAL_SHARE_WEIGHT = 1
const TOTAL = 490 + PRIMAL_COUNT // 495 physical tokens
const TOTAL_SHARE_WEIGHT = 490 * NORMAL_SHARE_WEIGHT + PRIMAL_COUNT * PRIMAL_SHARE_WEIGHT // 500

const FRAGMENT_WEIGHTS = [
  { type: 'Splinter', weight: 60 },
  { type: 'Chip', weight: 25 },
  { type: 'Facet Fragment', weight: 12 },
  { type: 'Core Splinter', weight: 3 },
]

function pickFragmentType(seed) {
  const roll = seed % 100
  let acc = 0
  for (const { type, weight } of FRAGMENT_WEIGHTS) {
    acc += weight
    if (roll < acc) return type
  }
  return 'Splinter'
}

function clampAura(parentAura, tokenId) {
  const delta = (tokenId % 5) - 2
  return Math.min(10, Math.max(1, parentAura + delta))
}

function primalColour(i) {
  const colours = ['Iridescent', 'Prismatic', 'Aurora', 'Spectrum', 'Radiant']
  return colours[i % colours.length]
}

function buildDescription(entry) {
  if (entry.parentGem === 'None') {
    return `A rare ${entry.baseColour.toLowerCase()} primal shard untethered from any single ElectroGem. It pulses at residual aura ${entry.residualAura}/10 and entitles its holder to a double share of launchpad platform fees.`
  }
  return `A fractured splinter chipped from ${entry.parentGem}, the ${entry.baseColour} ${entry.cutEcho} ElectroGem. Its ${entry.fragmentType.toLowerCase()} form still hums at residual aura ${entry.residualAura}/10 and entitles its holder to a share of launchpad platform fees.`
}

export async function buildManifest() {
  const gems = await fetchElectroGems()
  const entries = []
  let tokenId = 1

  for (const gem of gems) {
    for (let shardOf = 1; shardOf <= SHARDS_PER_PARENT; shardOf++) {
      const fragmentType = pickFragmentType(tokenId * 17 + shardOf * 3)
      const residualAura = clampAura(gem.auraScore, tokenId)
      const name = `${gem.name} Shard #${String(shardOf).padStart(2, '0')}`
      entries.push({
        tokenId,
        name,
        parentGem: gem.name,
        baseColour: gem.baseColour,
        cutEcho: gem.cut,
        fragmentType,
        residualAura,
        shardOf,
        shareWeight: NORMAL_SHARE_WEIGHT,
        isPrimal: false,
        imageFile: `images/${String(tokenId).padStart(3, '0')}.png`,
        metadataFile: `metadata/${tokenId}.json`,
      })
      tokenId++
    }
  }

  for (let i = 0; i < PRIMAL_COUNT; i++) {
    const shardOf = i + 1
    entries.push({
      tokenId,
      name: `Primal Shard #${String(shardOf).padStart(2, '0')}`,
      parentGem: 'None',
      baseColour: primalColour(i),
      cutEcho: 'Primal',
      fragmentType: 'Core Splinter',
      residualAura: Math.min(10, 7 + (i % 4)),
      shardOf,
      shareWeight: PRIMAL_SHARE_WEIGHT,
      isPrimal: true,
      imageFile: `images/${String(tokenId).padStart(3, '0')}.png`,
      metadataFile: `metadata/${tokenId}.json`,
    })
    tokenId++
  }

  if (entries.length !== TOTAL) {
    throw new Error(`Expected ${TOTAL} entries, got ${entries.length}`)
  }

  return { gems, entries }
}

export function entryToMetadata(entry) {
  return {
    name: entry.name,
    description: buildDescription(entry),
    image: entry.imageFile,
    attributes: [
      { trait_type: 'Collection', value: 'Gem Shards' },
      { trait_type: 'Parent Gem', value: entry.parentGem },
      { trait_type: 'Base Colour', value: entry.baseColour },
      { trait_type: 'Cut Echo', value: entry.cutEcho },
      { trait_type: 'Fragment Type', value: entry.fragmentType },
      {
        trait_type: 'Residual Aura',
        display_type: 'number',
        max_value: 10,
        value: entry.residualAura,
      },
      {
        trait_type: 'Shard of',
        display_type: 'number',
        max_value: entry.isPrimal ? PRIMAL_COUNT : SHARDS_PER_PARENT,
        value: entry.shardOf,
      },
      {
        trait_type: 'Share Weight',
        display_type: 'number',
        max_value: PRIMAL_SHARE_WEIGHT,
        value: entry.shareWeight,
      },
    ],
  }
}

export async function writeManifestAndMetadata() {
  const { gems, entries } = await buildManifest()
  const metadataDir = path.join(ROOT, 'metadata')
  const dataDir = path.join(ROOT, 'data')
  await mkdir(metadataDir, { recursive: true })
  await mkdir(dataDir, { recursive: true })

  for (const entry of entries) {
    const meta = entryToMetadata(entry)
    await writeFile(
      path.join(ROOT, entry.metadataFile),
      `${JSON.stringify(meta, null, 2)}\n`,
      'utf8',
    )
  }

  const manifest = {
    version: 1,
    total: TOTAL,
    totalShareWeight: TOTAL_SHARE_WEIGHT,
    primalCount: PRIMAL_COUNT,
    primalShareWeight: PRIMAL_SHARE_WEIGHT,
    imageSize: 4096,
    artDirection: {
      scale: 'medium-small shard ~25-35% frame height',
      exposure: 'even mid-tone brightness across entire collection, rich saturated neon colours',
      background: 'vibrant glowing colour-matched PCB circuitry on dark navy',
      detail: 'high facet detail, internal lightning veins, sparkle particles, vertex flares',
    },
    electrogems: gems,
    entries,
  }

  await writeFile(path.join(dataDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${entries.length} metadata files and manifest.json`)
  return manifest
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  writeManifestAndMetadata().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
