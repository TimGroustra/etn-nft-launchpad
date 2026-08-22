import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '.cursor', 'deploy-bundle-verify-collection-contract.json'), 'utf8'),
)

// stdout for piping into MCP tooling / manual deploy
process.stdout.write(JSON.stringify(payload))
