import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const envPath = path.join(root, '.env')

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  }
}

const base = path.join(root, 'supabase', 'functions')
const index = fs
  .readFileSync(path.join(base, 'verify-collection-contract', 'index.ts'), 'utf8')
  .replaceAll("'../_shared/", "'./_shared/")

const files = [
  { name: 'index.ts', content: index },
  { name: '_shared/utils.ts', content: fs.readFileSync(path.join(base, '_shared', 'utils.ts'), 'utf8') },
  {
    name: '_shared/contract-verification.ts',
    content: fs.readFileSync(path.join(base, '_shared', 'contract-verification.ts'), 'utf8'),
  },
  {
    name: '_shared/editable-erc721-verification.json',
    content: fs.readFileSync(path.join(base, '_shared', 'editable-erc721-verification.json'), 'utf8'),
  },
]

const projectRef = 'sktexilttapijefdusni'
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
        name: 'verify-collection-contract',
        entrypoint_path: 'index.ts',
        verify_jwt: true,
      }),
    ],
    { type: 'application/json' },
  ),
)

for (const file of files) {
  const type = file.name.endsWith('.json') ? 'application/json' : 'application/typescript'
  form.append('file', new Blob([file.content], { type }), file.name)
}

const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=verify-collection-contract`,
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
