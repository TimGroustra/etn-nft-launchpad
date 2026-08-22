/**
 * Export EditableERC721 standard JSON input for Blockscout verification in edge functions.
 * Run after `npx hardhat compile` whenever contracts change.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const buildInfoDir = path.join(root, 'artifacts', 'build-info')
const outPath = path.join(root, 'supabase', 'functions', '_shared', 'editable-erc721-verification.json')

const buildFiles = fs.readdirSync(buildInfoDir).map((file) => path.join(buildInfoDir, file))
let bundle = null

for (const file of buildFiles) {
  const info = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (info.output?.contracts?.['contracts/EditableERC721.sol']?.EditableERC721) {
    bundle = {
      compilerVersion: `v${info.solcLongVersion}`,
      contractName: 'contracts/EditableERC721.sol:EditableERC721',
      standardJsonInput: info.input,
    }
    break
  }
}

if (!bundle) {
  console.error('EditableERC721 build info not found. Run: npx hardhat compile')
  process.exit(1)
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(bundle))
const publicPath = path.join(root, 'public', 'editable-erc721-verification.json')
fs.mkdirSync(path.dirname(publicPath), { recursive: true })
fs.writeFileSync(publicPath, JSON.stringify(bundle))
console.log('Wrote', outPath, `(${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`)
console.log('Wrote', publicPath)
