import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..', 'supabase', 'functions')

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

const bundles = {
  'collection-api': [
    ['index.ts', read('collection-api/index.ts')],
    ['../_shared/utils.ts', read('_shared/utils.ts')],
    ['../_shared/collection-validation.ts', read('_shared/collection-validation.ts')],
  ],
  'sync-token-uri': [
    ['index.ts', read('sync-token-uri/index.ts')],
    ['../_shared/utils.ts', read('_shared/utils.ts')],
    ['../_shared/nft-metadata.ts', read('_shared/nft-metadata.ts')],
  ],
  'verify-publish-payment': [
    ['index.ts', read('verify-publish-payment/index.ts')],
    ['../_shared/utils.ts', read('_shared/utils.ts')],
  ],
  'verify-collection-contract': [
    ['index.ts', read('verify-collection-contract/index.ts').replaceAll("'../_shared/", "'./_shared/")],
    ['_shared/utils.ts', read('_shared/utils.ts')],
    ['_shared/contract-verification.ts', read('_shared/contract-verification.ts')],
  ],
}

for (const [name, files] of Object.entries(bundles)) {
  const outPath = path.join(__dirname, '..', '.cursor', `deploy-bundle-${name}.json`)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(
    outPath,
    JSON.stringify({
      project_id: 'sktexilttapijefdusni',
      name,
      entrypoint_path: 'index.ts',
      verify_jwt: true,
      files: files.map(([name, content]) => ({ name, content })),
    }),
  )
  console.log('Wrote', outPath)
}
