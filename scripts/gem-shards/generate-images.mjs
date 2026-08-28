import { config } from 'dotenv'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { buildImagePrompt } from './color-prompts.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../gem-shards')
config({ path: path.resolve(__dirname, '../../.env') })
config({ path: path.resolve(__dirname, '../../.env.local') })
const SAMPLES = path.join(ROOT, 'samples/images')
const OUT = path.join(ROOT, 'images')
const DATA = path.join(ROOT, 'data')

const TARGET_SIZE = 4096
/** Target mean RGB (0-255) for collection-wide brightness balance. Tuned from approved sample 001. */
const TARGET_MEAN = 72

function parseArgs(argv) {
  const args = { from: 1, to: 495, copySamples: true, dryRun: false, provider: 'auto' }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--from') args.from = Number(argv[++i])
    else if (a === '--to') args.to = Number(argv[++i])
    else if (a === '--no-copy-samples') args.copySamples = false
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--provider') args.provider = argv[++i]
  }
  return args
}

async function loadManifest() {
  const raw = await readFile(path.join(DATA, 'manifest.json'), 'utf8')
  return JSON.parse(raw)
}

async function loadProgress() {
  const file = path.join(DATA, 'progress.json')
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return { completed: [] }
  }
}

async function saveProgress(progress) {
  await writeFile(path.join(DATA, 'progress.json'), `${JSON.stringify(progress, null, 2)}\n`)
}

async function imageMean(buffer) {
  const { channels } = await sharp(buffer).stats()
  return channels.reduce((sum, c) => sum + c.mean, 0) / channels.length
}

async function finalizeImage(buffer) {
  const meta = await sharp(buffer).metadata()
  const mean = await imageMean(buffer)
  const brightness = Math.min(1.35, Math.max(0.75, TARGET_MEAN / mean))
  let pipeline = sharp(buffer).modulate({ brightness, saturation: 1.08 })
  if (meta.width !== TARGET_SIZE || meta.height !== TARGET_SIZE) {
    pipeline = pipeline.resize(TARGET_SIZE, TARGET_SIZE, { kernel: sharp.kernel.lanczos3 })
  }
  return pipeline.png({ compressionLevel: 6, effort: 7 }).toBuffer()
}

async function upscaleSample(tokenId) {
  const src = path.join(SAMPLES, `${String(tokenId).padStart(3, '0')}.png`)
  const buf = await readFile(src)
  return finalizeImage(buf)
}

async function generateGemini(prompt, referenceBuffer) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is required for image generation')

  const model = process.env.GEM_SHARD_IMAGE_MODEL ?? 'gemini-2.5-flash-image'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

  const parts = [{ text: prompt }]
  if (referenceBuffer) {
    parts.unshift({
      inlineData: {
        mimeType: 'image/png',
        data: referenceBuffer.toString('base64'),
      },
    })
    parts.push({
      text: 'Match the reference style: medium-small shard scale, vibrant glowing circuitry background, balanced mid-tone brightness, high facet detail.',
    })
  }

  const generationConfig = {
    responseModalities: ['TEXT', 'IMAGE'],
  }
  if (model.includes('3.1') || model.includes('3-pro')) {
    generationConfig.imageConfig = { aspectRatio: '1:1', imageSize: '4K' }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini image API ${res.status}: ${text}`)
  }

  const json = await res.json()
  const outParts = json.candidates?.[0]?.content?.parts ?? []
  for (const part of outParts) {
    if (part.inlineData?.data) return Buffer.from(part.inlineData.data, 'base64')
  }
  throw new Error(`Gemini response missing image data: ${JSON.stringify(json).slice(0, 400)}`)
}

async function generateImage(provider, prompt, referenceBuffer) {
  if (provider === 'gemini') return generateGemini(prompt, referenceBuffer)
  return generateOpenAI(prompt)
}

async function withRetries(fn, max = 5) {
  for (let attempt = 0; attempt < max; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const retryable = /429|503|RESOURCE_EXHAUSTED|rate/i.test(String(err))
      if (!retryable || attempt === max - 1) throw err
      const wait = 2 ** attempt * 2000 + Math.random() * 1000
      console.warn(`  retry in ${Math.round(wait)}ms (${err.message})`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
}

async function generateOpenAI(prompt) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is required for image generation')

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GEM_SHARD_IMAGE_MODEL ?? 'gpt-image-1',
      prompt,
      size: '1024x1024',
      quality: 'high',
      n: 1,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI image API ${res.status}: ${text}`)
  }

  const json = await res.json()
  const item = json.data?.[0]
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64')
  if (item?.url) {
    const img = await fetch(item.url)
    if (!img.ok) throw new Error(`Failed to download generated image: ${img.status}`)
    return Buffer.from(await img.arrayBuffer())
  }
  throw new Error('OpenAI response missing image data')
}

async function writeImage(tokenId, buffer) {
  const file = path.join(OUT, `${String(tokenId).padStart(3, '0')}.png`)
  await writeFile(file, buffer)
  return file
}

async function main() {
  const args = parseArgs(process.argv)
  await mkdir(OUT, { recursive: true })

  const provider =
    args.provider === 'openai'
      ? 'openai'
      : args.provider === 'gemini'
        ? 'gemini'
        : process.env.GEMINI_API_KEY
          ? 'gemini'
          : process.env.OPENAI_API_KEY
            ? 'openai'
            : null
  if (!provider && !args.dryRun) {
    throw new Error('Set GEMINI_API_KEY or OPENAI_API_KEY to generate images')
  }

  const referenceBuffer = await readFile(path.join(SAMPLES, '001.png')).catch(() => null)

  const manifest = await loadManifest()
  const progress = await loadProgress()
  const completed = new Set(progress.completed)

  const entries = manifest.entries.filter(
    (e) => e.tokenId >= args.from && e.tokenId <= args.to,
  )

  console.log(
    `Generating token IDs ${args.from}-${args.to} (${entries.length} images) @ ${TARGET_SIZE}px via ${provider ?? 'dry-run'}`,
  )

  for (const entry of entries) {
    if (completed.has(entry.tokenId)) {
      console.log(`skip #${entry.tokenId} (already done)`)
      continue
    }

    const prompt = buildImagePrompt(entry)
    if (args.dryRun) {
      console.log(`#${entry.tokenId} ${entry.name}\n  ${prompt}\n`)
      continue
    }

    let raw
    if (args.copySamples && entry.tokenId <= 5) {
      console.log(`#${entry.tokenId} upscaling approved sample...`)
      raw = await upscaleSample(entry.tokenId)
    } else {
      console.log(`#${entry.tokenId} generating ${entry.name}...`)
      raw = await withRetries(() => generateImage(provider, prompt, referenceBuffer))
      raw = await finalizeImage(raw)
    }

    const file = await writeImage(entry.tokenId, raw)
    completed.add(entry.tokenId)
    progress.completed = [...completed].sort((a, b) => a - b)
    await saveProgress(progress)
    console.log(`  wrote ${file}`)

    await new Promise((r) => setTimeout(r, 1500))
  }

  console.log('Done.')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
