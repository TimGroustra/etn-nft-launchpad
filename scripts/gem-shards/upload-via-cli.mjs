import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { loadEnvFiles } from '../load-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..', '..')
const GEM_SHARDS_DIR = path.join(ROOT, 'gem-shards')
const BUCKET = process.env.GEM_SHARDS_STORAGE_BUCKET ?? 'gem-shards'
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'sktexilttapijefdusni'

async function main() {
  loadEnvFiles(ROOT)
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('Set SUPABASE_ACCESS_TOKEN in .env')

  const metadataDir = path.join(GEM_SHARDS_DIR, 'metadata')
  const imagesDir = path.join(GEM_SHARDS_DIR, 'images')
  const tasks = [
    ...fs.readdirSync(metadataDir).filter((f) => f.endsWith('.json')).map((f) => ({
      local: path.join(metadataDir, f),
      remote: `metadata/${f}`,
    })),
    ...fs.readdirSync(imagesDir).filter((f) => f.endsWith('.png')).map((f) => ({
      local: path.join(imagesDir, f),
      remote: `images/${f}`,
    })),
  ]

  console.log(`Uploading metadata + images via Supabase CLI...`)
  for (const [localDir, remotePrefix] of [
    [path.join(GEM_SHARDS_DIR, 'metadata'), `metadata`],
    [path.join(GEM_SHARDS_DIR, 'images'), `images`],
  ]) {
    const result = spawnSync(
      'npx',
      [
        'supabase',
        'storage',
        'cp',
        '--experimental',
        '-r',
        localDir,
        `ss:///${BUCKET}/${remotePrefix}`,
        '--project-ref',
        PROJECT_REF,
      ],
      {
        env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
        stdio: 'inherit',
        shell: true,
      },
    )
    if (result.status !== 0) {
      throw new Error(`Failed uploading ${remotePrefix}`)
    }
    console.log(`Uploaded ${remotePrefix}/`)
  }

  const publicBase = `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/${BUCKET}`
  console.log('')
  console.log('Static asset URLs:')
  console.log(`GEM_SHARDS_METADATA_BASE_URL=${publicBase}/metadata`)
  console.log(`GEM_SHARDS_IMAGE_BASE_URL=${publicBase}/images`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
