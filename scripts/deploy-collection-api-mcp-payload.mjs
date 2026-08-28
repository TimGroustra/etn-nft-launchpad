import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..', 'supabase', 'functions')

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

const files = [
  ['index.ts', read('collection-api/index.ts').replaceAll("'../_shared/", "'./_shared/")],
  ['_shared/utils.ts', read('_shared/utils.ts')],
  ['_shared/collection-validation.ts', read('_shared/collection-validation.ts')],
  ['_shared/nft-metadata.ts', read('_shared/nft-metadata.ts')],
  ['_shared/storage-paths.ts', read('_shared/storage-paths.ts')],
  ['_shared/admin.ts', read('_shared/admin.ts')],
  ['_shared/creator-access.ts', read('_shared/creator-access.ts')],
  ['_shared/mint-panel-availability.ts', read('_shared/mint-panel-availability.ts')],
].map(([name, content]) => ({ name, content }))

const payload = {
  project_id: 'sktexilttapijefdusni',
  name: 'collection-api',
  entrypoint_path: 'index.ts',
  verify_jwt: true,
  files,
}

fs.writeFileSync(path.join(__dirname, '..', '.cursor', 'deploy-mcp-payload.json'), JSON.stringify(payload))
console.log('Wrote deploy payload with', files.length, 'files')
