import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall']
const INNER_WALL_NAMES = ['north-inner-wall', 'south-inner-wall', 'east-inner-wall', 'west-inner-wall']
const CENTER_WALL_NAMES = ['north-center-wall', 'south-center-wall', 'east-center-wall', 'west-center-wall']

const keys = []
for (let i = 0; i < 5; i++) {
  for (const wall of WALL_NAMES) {
    keys.push(`${wall}-${i}-ground`)
    keys.push(`${wall}-${i}-first`)
  }
}
for (let i = 0; i < 2; i++) {
  for (const wall of INNER_WALL_NAMES) {
    keys.push(`${wall}-inner-${i}`)
    keys.push(`${wall}-outer-${i}`)
  }
}
for (const wall of CENTER_WALL_NAMES) keys.push(`${wall}-0`)

const collections = [
  {
    name: 'Gem Shards',
    address: '0x6cb09b4cb3d2dca90e720565c101500abe131001',
    wall: '#4A235A',
    text: '#F4D03F',
    tokens: [1, 2, 3, 5, 8, 13, 21, 34, 55, 89],
  },
  {
    name: 'ElectroGems',
    address: '0xcff0d88ed5311bab09178b6ec19a464100880984',
    wall: '#1A5276',
    text: '#85C1E9',
    tokens: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
  {
    name: 'Club Watches',
    address: '0x9b852bd6965f050e9ab8eed4c900742b1d01fdd1',
    wall: '#1B2631',
    text: '#D4AC0D',
    tokens: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
]

const treasury = '0x126aa663bdedd6ae477fd28a7d0b624b8109d15d'

const values = keys
  .map((key, i) => {
    const c = collections[i % collections.length]
    const token = c.tokens[i % c.tokens.length]
    return `('${key}', '${c.name}', '${c.address}', ${token}, false, '${c.wall}', '${c.text}', now(), '${treasury}')`
  })
  .join(',\n')

const sql = `-- Seed 3D gallery panels with Gem Shards, ElectroGems, and Club Watches
INSERT INTO public.gallery_config (
  panel_key,
  collection_name,
  contract_address,
  default_token_id,
  show_collection,
  wall_color,
  text_color,
  updated_at,
  updated_by_address
) VALUES
${values}
ON CONFLICT (panel_key) DO UPDATE SET
  collection_name = EXCLUDED.collection_name,
  contract_address = EXCLUDED.contract_address,
  default_token_id = EXCLUDED.default_token_id,
  show_collection = EXCLUDED.show_collection,
  wall_color = EXCLUDED.wall_color,
  text_color = EXCLUDED.text_color,
  updated_at = EXCLUDED.updated_at,
  updated_by_address = EXCLUDED.updated_by_address;
`

const outPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260830001500_seed_gallery_collections.sql')
fs.writeFileSync(outPath, sql, 'utf8')
console.log(`Wrote ${keys.length} panel rows to ${outPath}`)
