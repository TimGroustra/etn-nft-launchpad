import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

export function loadEnvFiles(root = ROOT) {
  for (const filename of ['.env', '.env.local']) {
    const envPath = path.join(root, filename)
    if (!fs.existsSync(envPath)) continue
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)=(.*)$/)
      if (!match) continue
      const key = match[1].trim()
      const value = match[2].trim().replace(/^['"]|['"]$/g, '')
      if (value && (!process.env[key] || process.env[key] === '')) {
        process.env[key] = value
      }
    }
  }
}
