import { execSync } from 'node:child_process'
import fs from 'node:fs'

const api = execSync(
  'node scripts/bundle-edge-function.mjs gem-shards-api _shared/utils.ts _shared/admin.ts',
  { encoding: 'utf8' },
)
fs.writeFileSync('.cursor/bundle-gem-shards-api.json', api)

const meta = execSync('node scripts/bundle-edge-function.mjs gem-shard-metadata', { encoding: 'utf8' })
fs.writeFileSync('.cursor/bundle-gem-shard-metadata.json', meta)

const marketProbe = execSync('node scripts/bundle-edge-function.mjs market-probe _shared/utils.ts', {
  encoding: 'utf8',
})
fs.writeFileSync('.cursor/bundle-market-probe.json', marketProbe)

const parsed = JSON.parse(api)
console.log('api import rewrite:', parsed.files[0].content.includes("from './_shared/"))
console.log('metadata verify_jwt:', JSON.parse(meta).verify_jwt)
