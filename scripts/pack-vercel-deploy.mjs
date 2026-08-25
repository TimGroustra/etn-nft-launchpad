import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.cursor',
  'coverage',
  'cache',
  'artifacts',
  'supabase',
  'contracts',
  'test',
  'scripts',
  '.temp',
])

const SKIP_FILES = new Set(['.env', '.env.local'])

function shouldInclude(relPath) {
  const parts = relPath.split('/')
  if (parts.some((part) => SKIP_DIRS.has(part))) return false
  if (SKIP_FILES.has(path.basename(relPath))) return false
  return true
}

function walk(dir, rel = '') {
  const files = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name)
    const relPath = rel ? `${rel}/${ent.name}` : ent.name
    if (!shouldInclude(relPath)) continue
    if (ent.isDirectory()) {
      files.push(...walk(abs, relPath))
      continue
    }
    files.push({
      file: relPath.replace(/\\/g, '/'),
      data: fs.readFileSync(abs, 'utf8'),
    })
  }
  return files
}

const files = walk(root)
const outPath = path.join(root, '.cursor', 'vercel-deploy-payload.json')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(
  outPath,
  JSON.stringify({
    target: 'production',
    name: 'etn-nft-launchpad',
    teamId: 'team_B5mFGtUuuP2V79dwq7Cdyei0',
    files,
  }),
)
console.log(`Wrote ${files.length} files to ${outPath}`)
