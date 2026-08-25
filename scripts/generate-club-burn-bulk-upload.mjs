import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const SOURCE_IMAGE = process.argv[2]
  ?? path.join(
    process.env.USERPROFILE ?? '',
    '.cursor/projects/c-Users-Timot-dyad-apps-NinjaJars/assets/c__Users_Timot_AppData_Roaming_Cursor_User_workspaceStorage_5444d91a4903d3614d0a226325ea33b1_images_image_ce2da114-08e848c7-8af2-426f-9d81-9fa27f2df659.jpg',
  )

const COUNT = Number(process.argv[3] ?? process.env.TOKEN_COUNT ?? 100)
const OUT_DIR = path.join(root, 'bulk-upload', '100-club-burn')

const COLLECTION_NAME = '100% Club Burn'
const DESCRIPTION =
  'Every resale royalty is burned into $CLUB. Hold the flame — 100% of marketplace royalties fuel the burn.'

if (!Number.isInteger(COUNT) || COUNT < 1 || COUNT > 10_000) {
  console.error('Token count must be an integer from 1 to 10000.')
  process.exit(1)
}

if (!fs.existsSync(SOURCE_IMAGE)) {
  console.error(`Source image not found: ${SOURCE_IMAGE}`)
  process.exit(1)
}

const ext = path.extname(SOURCE_IMAGE).toLowerCase() || '.jpg'
const imageExt = ext === '.jpeg' ? '.jpg' : ext

fs.mkdirSync(OUT_DIR, { recursive: true })

for (let tokenId = 1; tokenId <= COUNT; tokenId += 1) {
  const imageName = `${tokenId}${imageExt}`
  const jsonName = `${tokenId}.json`

  fs.copyFileSync(SOURCE_IMAGE, path.join(OUT_DIR, imageName))

  const metadata = {
    name: `${COLLECTION_NAME} #${tokenId}`,
    description: DESCRIPTION,
    image: imageName,
    attributes: [
      { trait_type: 'Royalties Burn', value: '100%' },
      { trait_type: 'Token', value: 'CLUB' },
      { trait_type: 'Edition', value: `${tokenId} of ${COUNT}` },
    ],
  }

  fs.writeFileSync(path.join(OUT_DIR, jsonName), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
}

const readme = `# 100% Club Burn — bulk upload pack

Generated ${COUNT} token pair(s) for the ETN NFT Launchpad bulk importer.

## Files

- \`1${imageExt}\` + \`1.json\` … \`${COUNT}${imageExt}\` + \`${COUNT}.json\`
- Same artwork for every token; names are numbered editions.

## How to import

1. Create or edit a collection and set **max supply** to **${COUNT}** (or higher).
2. On the Artwork step, click **Bulk upload → Choose folder**.
3. Select this folder (\`bulk-upload/100-club-burn\`).
4. Review imported rows, then save.

## Regenerate a different supply

\`\`\`bash
node scripts/generate-club-burn-bulk-upload.mjs "path/to/image.jpg" 500
\`\`\`

Royalties are **not** included in JSON — the launchpad adds them on sync.
`

fs.writeFileSync(path.join(OUT_DIR, 'README.md'), readme, 'utf8')

console.log(`Wrote ${COUNT} image + JSON pairs to ${OUT_DIR}`)
