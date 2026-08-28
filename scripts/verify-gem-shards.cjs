/**
 * Verify deployed GemShards on Blockscout (mainnet or testnet).
 * Usage: node scripts/verify-gem-shards.cjs [mainnet|testnet] [contractAddress]
 */
const fs = require('fs')
const path = require('path')
const hre = require('hardhat')
const { loadEnvFiles } = require('./load-env.cjs')

const NETWORKS = {
  mainnet: { chainId: 52014, hardhatNetwork: 'electroneum' },
  testnet: { chainId: 5201420, hardhatNetwork: 'electroneumTestnet' },
}

async function main() {
  loadEnvFiles(path.join(__dirname, '..'))
  const networkKey = process.argv[2] === 'testnet' ? 'testnet' : 'mainnet'
  const { chainId, hardhatNetwork } = NETWORKS[networkKey]

  const deployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'deployments.json'), 'utf8'),
  )
  const deploymentKey = networkKey === 'testnet' ? 'electroneumTestnet' : 'electroneum'
  const contract =
    process.argv[3]
    ?? deployments[deploymentKey]?.GemShards
  if (!contract) throw new Error('GemShards address missing')

  const metadataBase =
    process.env.GEM_SHARDS_TOKEN_URI_BASE
    ?? 'https://sktexilttapijefdusni.supabase.co/functions/v1/gem-shard-metadata/'
  const electroGems = process.env.VITE_ELECTROGEMS_NFT_ADDRESS ?? '0xcff0d88Ed5311bAB09178b6ec19A464100880984'
  const clubWatch = process.env.VITE_CLUB_WATCH_NFT_ADDRESS ?? '0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1'
  const owner = process.env.VITE_TREASURY_ADDRESS ?? '0x126aa663BdeDd6Ae477fd28a7d0b624b8109D15d'

  console.log('Verifying GemShards at', contract, 'on', networkKey)
  await hre.run('verify:verify', {
    address: contract,
    constructorArguments: [owner, metadataBase, electroGems, clubWatch],
  }, {
    network: hardhatNetwork,
  })
  console.log('GemShards verified.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
