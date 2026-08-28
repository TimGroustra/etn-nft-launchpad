import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../gem-shards')
const OUT = path.join(ROOT, 'images')
const TARGET_SIZE = 4096
const TARGET_MEAN = 72

async function imageMean(buffer) {
  const { channels } = await sharp(buffer).stats()
  return channels.reduce((sum, c) => sum + c.mean, 0) / channels.length
}

async function finalize(buffer) {
  const meta = await sharp(buffer).metadata()
  const mean = await imageMean(buffer)
  const brightness = Math.min(1.35, Math.max(0.75, TARGET_MEAN / mean))
  let pipeline = sharp(buffer).modulate({ brightness, saturation: 1.08 })
  if (meta.width !== TARGET_SIZE || meta.height !== TARGET_SIZE) {
    pipeline = pipeline.resize(TARGET_SIZE, TARGET_SIZE, { kernel: sharp.kernel.lanczos3 })
  }
  return pipeline.png({ compressionLevel: 6, effort: 7 }).toBuffer()
}

const src = process.argv[2]
const tokenId = process.argv[3]
if (!src || !tokenId) {
  console.error('Usage: node finalize-one.mjs <source.png> <tokenId>')
  process.exit(1)
}

const buf = await readFile(src)
const out = await finalize(buf)
const dest = path.join(OUT, `${String(tokenId).padStart(3, '0')}.png`)
await writeFile(dest, out)
console.log(`Wrote ${dest} (${TARGET_SIZE}px)`)
