const fs = require('fs')
const path = require('path')

function loadEnvFiles(root = path.join(__dirname, '..')) {
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

module.exports = { loadEnvFiles }
