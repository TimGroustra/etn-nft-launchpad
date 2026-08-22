/**
 * Verify a published EditableERC721 collection on Blockscout.
 *
 * Usage:
 *   node scripts/verify-collection.cjs mainnet 0xContractAddress "Collection Name" SYM \
 *     0xCreatorWallet 5000 true 5000 10
 *
 * Args: network, contract, name, symbol, owner, mintBurnBps, burnOnMint, royaltyBurnBps, maxSupply
 */
const { ethers } = require('ethers')
const hre = require('hardhat')
const fs = require('fs')
const path = require('path')
const { CLUB_TOKEN, getDeploymentAddresses } = require('./chain-addresses.cjs')

const NETWORKS = {
  mainnet: { chainId: 52014, hardhatNetwork: 'electroneum' },
  testnet: { chainId: 5201420, hardhatNetwork: 'electroneumTestnet' },
}

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  }
}

async function main() {
  loadEnvFile()
  const networkKey = process.argv[2] === 'mainnet' ? 'mainnet' : 'testnet'
  const contract = process.argv[3]
  const name = process.argv[4]
  const symbol = process.argv[5]
  const owner = process.argv[6]
  const mintBurnBps = Number(process.argv[7] ?? 0)
  const burnOnMint = process.argv[8] === 'true'
  const royaltyBurnBps = Number(process.argv[9] ?? 0)
  const maxSupply = Number(process.argv[10] ?? 0)

  if (!contract || !name || !symbol || !owner || !maxSupply) {
    throw new Error(
      'Usage: node scripts/verify-collection.cjs <mainnet|testnet> <contract> <name> <symbol> <owner> <mintBurnBps> <burnOnMint> <royaltyBurnBps> <maxSupply>',
    )
  }

  const { chainId, hardhatNetwork } = NETWORKS[networkKey]
  const { wetn, swapRouter } = getDeploymentAddresses(chainId)
  const burnConfig = {
    mintBurnBps,
    burnOnMint,
    royaltyBurnBps,
  }

  console.log('Verifying EditableERC721 at', contract, 'on', networkKey)
  await hre.run('verify:verify', {
    address: contract,
    constructorArguments: [
      name,
      symbol,
      owner,
      CLUB_TOKEN,
      wetn,
      swapRouter,
      burnConfig,
      maxSupply,
      500,
    ],
    network: hardhatNetwork,
  })
  console.log('Collection verified.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
