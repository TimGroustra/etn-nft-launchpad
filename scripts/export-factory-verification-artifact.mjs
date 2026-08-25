/**
 * Export the EditableERC721 verification bundle that matches deployed factory bytecode.
 * Factories 0x85ceB5f1... (mainnet) and 0x368Fe607... (testnet) embed this variant:
 * tokenURI preview for unminted IDs, without the later _resolveMintedTokenURI helpers.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const contractPath = path.join(root, 'contracts', 'EditableERC721.sol')
const buildInfoDir = path.join(root, 'artifacts', 'build-info')
const outPath = path.join(root, 'public', 'editable-erc721-verification.json')
const sharedPath = path.join(root, 'supabase', 'functions', '_shared', 'editable-erc721-verification.json')

const original = fs.readFileSync(contractPath, 'utf8')
const factoryVersion = original
  .replace('return _resolveMintedTokenURI(tokenId);', 'return super.tokenURI(tokenId);')
  .replace(
    /    \/\/\/ @dev ERC721URIStorage[\s\S]*?    function _mintWithURI/,
    '    function _mintWithURI',
  )

try {
  fs.writeFileSync(contractPath, factoryVersion)
  execSync('npx hardhat compile --force', { stdio: 'inherit', cwd: root })

  const buildFiles = fs.readdirSync(buildInfoDir).map((file) => path.join(buildInfoDir, file))
  let bundle = null

  for (const file of buildFiles) {
    const info = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (info.output?.contracts?.['contracts/EditableERC721.sol']?.EditableERC721) {
      bundle = {
        compilerVersion: `v${info.solcLongVersion}`,
        contractName: 'contracts/EditableERC721.sol:EditableERC721',
        standardJsonInput: info.input,
        deployedBytecodeLength: info.output.contracts['contracts/EditableERC721.sol'].EditableERC721
          .evm.deployedBytecode.object.length,
      }
      break
    }
  }

  if (!bundle) {
    console.error('EditableERC721 build info not found.')
    process.exit(1)
  }

  const { deployedBytecodeLength, ...publishBundle } = bundle
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(publishBundle))
  fs.mkdirSync(path.dirname(sharedPath), { recursive: true })
  fs.writeFileSync(sharedPath, JSON.stringify(publishBundle))
  console.log('Wrote verification bundle', outPath, `(${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`)
  console.log('Deployed bytecode length:', deployedBytecodeLength)
} finally {
  fs.writeFileSync(contractPath, original)
}
