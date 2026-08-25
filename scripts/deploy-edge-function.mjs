import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const envPath = path.join(root, '.env')

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  }
}

const slug = process.argv[2]
if (!slug) {
  console.error('Usage: node scripts/deploy-edge-function.mjs <function-slug>')
  process.exit(1)
}

const bundlePath = path.join(root, '.cursor', `deploy-bundle-${slug}.json`)
if (!fs.existsSync(bundlePath)) {
  console.error(`Missing bundle: ${bundlePath}. Run node scripts/deploy-supabase-functions.mjs first.`)
  process.exit(1)
}

const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'))
const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const form = new FormData()
form.append(
  'metadata',
  new Blob(
    [
      JSON.stringify({
        name: bundle.name,
        entrypoint_path: bundle.entrypoint_path,
        verify_jwt: bundle.verify_jwt,
      }),
    ],
    { type: 'application/json' },
  ),
)

for (const file of bundle.files) {
  const type = file.name.endsWith('.json') ? 'application/json' : 'application/typescript'
  form.append('file', new Blob([file.content], { type }), file.name)
}

const projectRef = bundle.project_id
const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=${slug}`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  },
)

const body = await response.text()
console.log('status', response.status)
console.log(body)
