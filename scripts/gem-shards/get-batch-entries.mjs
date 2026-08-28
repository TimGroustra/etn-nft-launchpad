import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildImagePrompt } from './color-prompts.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(
  await readFile(path.resolve(__dirname, '../../gem-shards/data/manifest.json'), 'utf8'),
)

const from = Number(process.argv[2] ?? 111)
const to = Number(process.argv[3] ?? from)

for (const entry of manifest.entries) {
  if (entry.tokenId < from || entry.tokenId > to) continue
  console.log(JSON.stringify({
    tokenId: entry.tokenId,
    name: entry.name,
    filename: `gem-shard-${String(entry.tokenId).padStart(3, '0')}-raw.png`,
    prompt: buildImagePrompt(entry),
  }))
}
