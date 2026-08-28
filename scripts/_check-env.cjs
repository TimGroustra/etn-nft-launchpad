const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env')
console.log('envPath', envPath, 'exists', fs.existsSync(envPath))
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/)
    if (match && match[1].trim() === 'DEPLOYER_PRIVATE_KEY') {
      console.log('found line', match[1].trim(), 'value_len', match[2].trim().length)
    }
  }
}
console.log('process.env.DEPLOYER_PRIVATE_KEY len', (process.env.DEPLOYER_PRIVATE_KEY || '').length)
