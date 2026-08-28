import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const functionsDir = path.join(ROOT, 'supabase', 'functions')

const [functionName, ...extraFiles] = process.argv.slice(2)
if (!functionName) {
  console.error('Usage: node scripts/bundle-edge-function.mjs <function-name> [extra-relative-paths...]')
  process.exit(1)
}

const entrypoint = path.join(functionsDir, functionName, 'index.ts')
if (!fs.existsSync(entrypoint)) {
  console.error(`Missing ${entrypoint}`)
  process.exit(1)
}

const files = new Map()
function addFile(absPath, name) {
  files.set(name, fs.readFileSync(absPath, 'utf8'))
}

addFile(entrypoint, 'index.ts')

function rewriteSharedImports(content) {
  return content.replaceAll("from '../_shared/", "from './_shared/")
}

for (const rel of extraFiles) {
  const abs = path.join(functionsDir, rel)
  if (!fs.existsSync(abs)) {
    console.error(`Missing ${abs}`)
    process.exit(1)
  }
  addFile(abs, rel.replace(/\\/g, '/'))
}

const payload = {
  project_id: 'sktexilttapijefdusni',
  name: functionName,
  entrypoint_path: 'index.ts',
  verify_jwt: functionName !== 'gem-shard-metadata',
  files: [...files.entries()].map(([name, content]) => ({
    name,
    content: name === 'index.ts' ? rewriteSharedImports(content) : content,
  })),
}

process.stdout.write(JSON.stringify(payload))
