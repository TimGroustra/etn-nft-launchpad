import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PUBLIC = path.join(ROOT, 'public')
const BRAND = path.join(PUBLIC, 'brand')

const RAINBOW_SOURCE = path.join(
  BRAND,
  'logo-rainbow-source.jpg',
)
const BLUE_SOURCE = path.join(BRAND, 'logo-blue-source.jpg')

/** Make near-black pixels transparent; soften edges slightly. */
async function removeBlackBackground(inputPath, threshold = 42) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const max = Math.max(r, g, b)

    if (max <= threshold) {
      data[i + 3] = 0
      continue
    }

    if (max <= threshold + 28) {
      const fade = (max - threshold) / 28
      data[i + 3] = Math.round(data[i + 3] * fade)
    }
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  }).png()
}

async function writeSizedPng(pipeline, size, outputPath) {
  await pipeline
    .clone()
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outputPath)
}

async function main() {
  await mkdir(BRAND, { recursive: true })

  const rainbow = await removeBlackBackground(RAINBOW_SOURCE)
  const blue = await removeBlackBackground(BLUE_SOURCE)

  await writeFile(
    path.join(BRAND, 'logo-rainbow.png'),
    await rainbow.clone().png().toBuffer(),
  )
  await writeFile(
    path.join(BRAND, 'logo-blue.png'),
    await blue.clone().png().toBuffer(),
  )

  const faviconSizes = [
    [32, path.join(PUBLIC, 'favicon-32.png')],
    [180, path.join(PUBLIC, 'apple-touch-icon.png')],
    [192, path.join(PUBLIC, 'favicon-192.png')],
    [512, path.join(PUBLIC, 'favicon-512.png')],
  ]

  for (const [size, outputPath] of faviconSizes) {
    await writeSizedPng(rainbow, size, outputPath)
  }

  await writeSizedPng(blue, 64, path.join(BRAND, 'logo-blue-64.png'))
  await writeSizedPng(blue, 128, path.join(BRAND, 'logo-blue-128.png'))

  const faviconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <image href="/favicon-512.png" width="512" height="512" />
</svg>
`
  await writeFile(path.join(PUBLIC, 'favicon.svg'), faviconSvg, 'utf8')

  console.log('Generated transparent brand icons.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
