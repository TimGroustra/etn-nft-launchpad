import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  }
}

const ORIGIN = (process.env.METADATA_PUBLIC_ORIGIN || process.env.VITE_APP_URL || 'https://www.etn-nft-launchpad.club').replace(/\/$/, '')

function metadataUrl(collectionId, tokenId) {
  return `${ORIGIN}/m/${collectionId}/${tokenId}.json`
}

function imageUrl(imagePath) {
  return `${ORIGIN}/i/${imagePath.replace(/^\/+/, '')}`
}

loadEnvFile()

const collectionId = process.argv[2]
if (!collectionId) {
  console.error('Usage: node scripts/migrate-collection-proxy-urls.mjs <collection-id>')
  process.exit(1)
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)
const baseUri = `${ORIGIN}/m/${collectionId}/`

const { data: tokens, error: tokensError } = await supabase
  .from('collection_tokens')
  .select('id, token_id, image_storage_path, metadata_storage_path')
  .eq('collection_id', collectionId)
  .order('token_id', { ascending: true })

if (tokensError) throw tokensError
if (!tokens?.length) {
  console.error('No tokens found for collection', collectionId)
  process.exit(1)
}

for (const token of tokens) {
  if (token.token_id == null || !token.metadata_storage_path) continue

  const { data: file, error: downloadError } = await supabase.storage
    .from('collection-metadata')
    .download(token.metadata_storage_path)
  if (downloadError) throw downloadError

  const metadata = JSON.parse(await file.text())
  if (token.image_storage_path) {
    metadata.image = imageUrl(token.image_storage_path)
  }

  const { error: uploadError } = await supabase.storage
    .from('collection-metadata')
    .upload(token.metadata_storage_path, JSON.stringify(metadata, null, 2), {
      contentType: 'application/json',
      upsert: true,
    })
  if (uploadError) throw uploadError

  const tokenUri = metadataUrl(collectionId, token.token_id)
  const { error: updateError } = await supabase
    .from('collection_tokens')
    .update({ token_uri: tokenUri })
    .eq('id', token.id)
  if (updateError) throw updateError

  console.log(`Token ${token.token_id}: metadata + DB updated`)
}

const { error: collectionError } = await supabase
  .from('collections')
  .update({ base_uri: baseUri })
  .eq('id', collectionId)
if (collectionError) throw collectionError

console.log(`Collection base_uri set to ${baseUri}`)
console.log('Done.')
