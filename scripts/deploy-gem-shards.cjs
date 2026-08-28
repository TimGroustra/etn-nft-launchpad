const { ethers } = require('hardhat')
const fs = require('fs')
const path = require('path')
const { loadEnvFiles } = require('./load-env.cjs')

async function waitForDeployed(contract, label) {
  const tx = contract.deploymentTransaction()
  if (!tx) throw new Error(`Missing deployment transaction for ${label}`)
  console.log(`${label} tx:`, tx.hash)
  const receipt = await tx.wait(1)
  if (!receipt || receipt.status !== 1) {
    throw new Error(`${label} deployment failed`)
  }
  const address = await contract.getAddress()
  console.log(`${label}:`, address)
  return address
}

async function main() {
  loadEnvFiles(path.join(__dirname, '..'))
  const [deployer] = await ethers.getSigners()
  const chainId = Number((await ethers.provider.getNetwork()).chainId)
  const configKey = chainId === 52014 ? 'mainnet' : 'testnet'

  const treasury = process.env.VITE_TREASURY_ADDRESS ?? '0x126aa663BdeDd6Ae477fd28a7d0b624b8109D15d'
  const electroGems = process.env.VITE_ELECTROGEMS_NFT_ADDRESS ?? '0xcff0d88Ed5311bAB09178b6ec19A464100880984'
  const clubWatch = process.env.VITE_CLUB_WATCH_NFT_ADDRESS ?? '0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1'
  const metadataBase =
    process.env.GEM_SHARDS_TOKEN_URI_BASE
    ?? `https://${process.env.SUPABASE_PROJECT_REF ?? 'sktexilttapijefdusni'}.supabase.co/functions/v1/gem-shard-metadata/`

  console.log('Deploying Gem Shards stack with:', deployer.address, 'on chain', chainId)

  const PublishFeeDistributor = await ethers.getContractFactory('PublishFeeDistributor')
  const distributor = await PublishFeeDistributor.deploy(deployer.address, treasury)
  const distributorAddress = await waitForDeployed(distributor, 'PublishFeeDistributor')

  const GemShards = await ethers.getContractFactory('GemShards')
  const gemShards = await GemShards.deploy(
    deployer.address,
    distributorAddress,
    metadataBase,
    electroGems,
    clubWatch,
  )
  const gemShardsAddress = await waitForDeployed(gemShards, 'GemShards')

  await (await gemShards.setDistributor(distributorAddress)).wait(1)
  await (await distributor.setGemShards(gemShardsAddress)).wait(1)

  const LaunchpadMinter = await ethers.getContractFactory('LaunchpadMinter')
  const minter = await LaunchpadMinter.deploy(300, distributorAddress, electroGems, clubWatch)
  const minterAddress = await waitForDeployed(minter, 'LaunchpadMinter')

  const deploymentsPath = path.join(__dirname, '..', 'deployments.json')
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))
  const key = chainId === 52014 ? 'electroneum' : 'electroneumTestnet'
  deployments[key].PublishFeeDistributor = distributorAddress
  deployments[key].GemShards = gemShardsAddress
  deployments[key].LaunchpadMinter = minterAddress
  deployments[key].gemShardsDeployedAt = new Date().toISOString()
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2))

  console.log('')
  console.log('Next steps:')
  console.log('1. Upload gem-shards static assets: npm run gem-shards:upload')
  console.log('2. Deploy gem-shard-metadata edge function and set GEM_SHARDS_DISTRIBUTOR_ADDRESS')
  console.log('3. Wire factories: node scripts/wire-gem-shards-fees.cjs', configKey)
  console.log('4. Register collection row: node scripts/register-gem-shards-collection.cjs', configKey)
  console.log('')
  console.log('Env vars:')
  console.log(`VITE_GEM_SHARDS_ADDRESS_${configKey.toUpperCase()}=${gemShardsAddress}`)
  console.log(`VITE_PUBLISH_FEE_DISTRIBUTOR_ADDRESS_${configKey.toUpperCase()}=${distributorAddress}`)
  console.log(`VITE_LAUNCHPAD_MINTER_${configKey.toUpperCase()}=${minterAddress}`)
  console.log('')
  console.log('platform_config SQL:')
  console.log(
    `INSERT INTO platform_config (key, value) VALUES ('gem_shards_${configKey}', '${gemShardsAddress}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
  )
  console.log(
    `INSERT INTO platform_config (key, value) VALUES ('gem_shards_status_${configKey}', 'draft') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
  )
  console.log(
    `INSERT INTO platform_config (key, value) VALUES ('publish_fee_distributor_${configKey}', '${distributorAddress}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
  )
  console.log(
    `INSERT INTO platform_config (key, value) VALUES ('launchpad_minter_${configKey}', '${minterAddress}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
