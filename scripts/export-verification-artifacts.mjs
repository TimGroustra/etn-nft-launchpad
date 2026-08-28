/**
 * Export standard JSON verification bundles for all launchpad collection contracts.
 * Run after `npm run compile` whenever contracts change.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const buildInfoDir = path.join(root, 'artifacts', 'build-info')

const TARGETS = [
  {
    contractPath: 'contracts/EditableERC721.sol',
    contractName: 'EditableERC721',
    outName: 'editable-erc721-verification.json',
  },
  {
    contractPath: 'contracts/EditableERC721V2.sol',
    contractName: 'EditableERC721V2',
    outName: 'editable-erc721-v2-verification.json',
  },
  {
    contractPath: 'contracts/EditableERC1155.sol',
    contractName: 'EditableERC1155',
    outName: 'editable-erc1155-verification.json',
  },
  {
    contractPath: 'contracts/LaunchpadFactoryERC721V2.sol',
    contractName: 'LaunchpadFactoryERC721V2',
    outName: 'launchpad-factory-erc721-v2-verification.json',
  },
  {
    contractPath: 'contracts/LaunchpadFactoryERC1155.sol',
    contractName: 'LaunchpadFactoryERC1155',
    outName: 'launchpad-factory-erc1155-verification.json',
  },
  {
    contractPath: 'contracts/GemShards.sol',
    contractName: 'GemShards',
    outName: 'gem-shards-verification.json',
  },
]

function findBuildInfo() {
  return fs
    .readdirSync(buildInfoDir)
    .map((file) => JSON.parse(fs.readFileSync(path.join(buildInfoDir, file), 'utf8')))
}

function exportTarget(buildInfos, target) {
  const key = `${target.contractPath}:${target.contractName}`
  for (const info of buildInfos) {
    if (info.output?.contracts?.[target.contractPath]?.[target.contractName]) {
      return {
        compilerVersion: `v${info.solcLongVersion}`,
        contractName: key,
        standardJsonInput: info.input,
      }
    }
  }
  return null
}

const buildInfos = findBuildInfo()
let exported = 0

for (const target of TARGETS) {
  const bundle = exportTarget(buildInfos, target)
  if (!bundle) {
    console.warn(`Skip ${target.contractName}: build info not found`)
    continue
  }

  const sharedPath = path.join(root, 'supabase', 'functions', '_shared', target.outName)
  const publicPath = path.join(root, 'public', target.outName)
  const payload = JSON.stringify(bundle)

  fs.mkdirSync(path.dirname(sharedPath), { recursive: true })
  fs.writeFileSync(sharedPath, payload)
  fs.mkdirSync(path.dirname(publicPath), { recursive: true })
  fs.writeFileSync(publicPath, payload)
  console.log(`Wrote ${target.outName} (${(payload.length / 1024).toFixed(1)} KB)`)
  exported++
}

if (exported === 0) {
  console.error('No verification bundles exported. Run: npm run compile')
  process.exit(1)
}
