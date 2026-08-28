import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnvFiles } from '../load-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..', '..')
const GEM_SHARDS_DIR = path.join(ROOT, 'gem-shards')
const BUCKET = process.env.GEM_SHARDS_STORAGE_BUCKET ?? 'gem-shards'

function getContentType(filePath) {
  if (filePath.endsWith('.json')) return 'application/json'
  if (filePath.endsWith('.png')) return 'image/png'
  return 'application/octet-stream'
}

async function objectExists(serviceKey, supabaseUrl, storagePath) {
  const url = `${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`
  const maxAttempts = 8

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
      })
      if (response.ok) return true
      // Supabase may return 404 or 400 when the object is absent.
      if (response.status === 404 || response.status === 400) return false

      const retryable = response.status >= 500 || response.status === 429
      if (!retryable || attempt === maxAttempts) {
        throw new Error(`${storagePath}: HEAD ${response.status}`)
      }

      const delayMs = Math.min(30_000, 1_000 * 2 ** (attempt - 1))
      console.warn(`${storagePath}: HEAD ${response.status}, retrying in ${delayMs}ms (${attempt}/${maxAttempts})`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    } catch (error) {
      if (attempt === maxAttempts) throw error
      const delayMs = Math.min(30_000, 1_000 * 2 ** (attempt - 1))
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`${storagePath}: ${message}, retrying in ${delayMs}ms (${attempt}/${maxAttempts})`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  return false
}

async function uploadFile(serviceKey, supabaseUrl, localPath, storagePath) {
  const body = fs.readFileSync(localPath)
  const url = `${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`
  const maxAttempts = 8

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': getContentType(localPath),
          'x-upsert': 'true',
        },
        body,
      })
      if (response.ok) return

      const retryable = response.status >= 500 || response.status === 429
      const detail = await response.text()
      if (!retryable || attempt === maxAttempts) {
        throw new Error(`${storagePath}: ${response.status} ${detail}`)
      }

      const delayMs = Math.min(30_000, 1_000 * 2 ** (attempt - 1))
      console.warn(`${storagePath}: ${response.status}, retrying in ${delayMs}ms (${attempt}/${maxAttempts})`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    } catch (error) {
      if (attempt === maxAttempts) throw error
      const delayMs = Math.min(30_000, 1_000 * 2 ** (attempt - 1))
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`${storagePath}: ${message}, retrying in ${delayMs}ms (${attempt}/${maxAttempts})`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

async function main() {
  loadEnvFiles(ROOT)
  const dryRun = process.argv.includes('--dry-run')
  const skipExisting = process.argv.includes('--skip-existing')
  const only = process.argv.find((arg) => arg.startsWith('--only='))?.split('=')[1]

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL).replace(/\/$/, '')
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.SUPABASE_SERVICE_KEY
    ?? process.env.SERVICE_ROLE_KEY
  if (!dryRun && (!supabaseUrl || !serviceKey)) {
    throw new Error(
      'Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (or use --dry-run). '
      + 'SUPABASE_ACCESS_TOKEN is for management API only — storage upload needs the service role key.',
    )
  }

  const metadataDir = path.join(GEM_SHARDS_DIR, 'metadata')
  const imagesDir = path.join(GEM_SHARDS_DIR, 'images')

  const metadataFiles = fs.readdirSync(metadataDir).filter((name) => name.endsWith('.json')).sort()
  const imageFiles = fs.readdirSync(imagesDir).filter((name) => name.endsWith('.png')).sort()

  const tasks = []
  for (const file of metadataFiles) {
    tasks.push({
      local: path.join(metadataDir, file),
      remote: `metadata/${file}`,
    })
  }
  for (const file of imageFiles) {
    tasks.push({
      local: path.join(imagesDir, file),
      remote: `images/${file}`,
    })
  }

  const filtered = only
    ? tasks.filter((task) => task.remote.includes(only))
    : tasks

  console.log(
    `Uploading ${filtered.length} files to bucket "${BUCKET}"${dryRun ? ' (dry run)' : ''}${skipExisting ? ' (skip existing)' : ''}`,
  )

  let completed = 0
  let skipped = 0
  for (const task of filtered) {
    if (dryRun) {
      console.log(`[dry-run] ${task.remote}`)
    } else {
      if (skipExisting && await objectExists(serviceKey, supabaseUrl, task.remote)) {
        skipped += 1
        completed += 1
        if (completed % 25 === 0 || completed === filtered.length) {
          console.log(`Uploaded ${completed}/${filtered.length} (${skipped} skipped)`)
        }
        continue
      }
      await uploadFile(serviceKey, supabaseUrl, task.local, task.remote)
      completed += 1
      if (completed % 25 === 0 || completed === filtered.length) {
        console.log(`Uploaded ${completed}/${filtered.length}`)
      }
    }
  }

  const projectRef = process.env.SUPABASE_PROJECT_REF
    ?? new URL(supabaseUrl).hostname.split('.')[0]
  const publicBase = `https://${projectRef}.supabase.co/storage/v1/object/public/${BUCKET}`

  console.log('')
  console.log('Static asset URLs:')
  console.log(`GEM_SHARDS_METADATA_BASE_URL=${publicBase}/metadata`)
  console.log(`GEM_SHARDS_IMAGE_BASE_URL=${publicBase}/images`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
