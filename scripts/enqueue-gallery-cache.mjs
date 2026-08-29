/**
 * Enqueue gallery_config panel tokens for slow cache warmup.
 * Run: node scripts/enqueue-gallery-cache.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env')

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
}

const configsRes = await fetch(
  `${supabaseUrl}/rest/v1/gallery_config?select=contract_address,default_token_id,show_collection&contract_address=not.is.null`,
  { headers },
)
const configs = await configsRes.json()
if (!configsRes.ok) {
  console.error('Failed to load gallery_config', configs)
  process.exit(1)
}

const tokenSet = new Set()
for (const row of configs) {
  const contract = String(row.contract_address).toLowerCase()
  const defaultId = Math.max(1, Number(row.default_token_id ?? 1))
  tokenSet.add(`${contract}:${defaultId}`)
  if (row.show_collection) {
    for (let i = 1; i <= 40; i++) tokenSet.add(`${contract}:${i}`)
  }
}

const rows = [...tokenSet].map((key) => {
  const [contract_address, tokenId] = key.split(':')
  return { contract_address, token_id: Number(tokenId), status: 'pending' }
})

console.log(`Enqueueing ${rows.length} tokens...`)

// Only insert new rows — never reset done/processing queue items back to pending.
const upsertRes = await fetch(`${supabaseUrl}/rest/v1/gallery_cache_queue?on_conflict=contract_address,token_id`, {
  method: 'POST',
  headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
  body: JSON.stringify(rows),
})

if (!upsertRes.ok) {
  console.error('Enqueue failed', await upsertRes.text())
  process.exit(1)
}

const tickRes = await fetch(`${supabaseUrl}/functions/v1/gallery-cache-tick`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
  body: '{}',
})

console.log('Cache tick status', tickRes.status, await tickRes.text())
