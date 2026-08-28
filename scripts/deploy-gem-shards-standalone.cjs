const fs = require('fs')
const path = require('path')
const { ethers } = require('ethers')
const { loadEnvFiles } = require('./load-env.cjs')

const NETWORKS = {
  mainnet: {
    rpc: process.env.ELECTRONEUM_MAINNET_RPC ?? 'https://rpc.ankr.com/electroneum',
    chainId: 52014,
    deploymentsKey: 'electroneum',
    configKey: 'mainnet',
  },
  testnet: {
    rpc: 'https://rpc.ankr.com/electroneum_testnet',
    chainId: 5201420,
    deploymentsKey: 'electroneumTestnet',
    configKey: 'testnet',
  },
}

function loadArtifact(name) {
  const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', `${name}.sol`, `${name}.json`)
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
}

async function waitForTx(provider, hash, label) {
  console.log(`${label} tx:`, hash)
  const receipt = await provider.waitForTransaction(hash, 1, 300_000)
  if (!receipt || receipt.status !== 1) throw new Error(`${label} failed`)
  return receipt
}

async function main() {
  loadEnvFiles(path.join(__dirname, '..'))
  const networkName = process.argv[2] === 'testnet' ? 'testnet' : 'mainnet'
  const network = NETWORKS[networkName]
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY
  if (!privateKey) throw new Error('DEPLOYER_PRIVATE_KEY missing')

  const provider = new ethers.JsonRpcProvider(network.rpc, network.chainId)
  const wallet = new ethers.Wallet(privateKey, provider)
  const treasury = process.env.VITE_TREASURY_ADDRESS ?? '0x126aa663BdeDd6Ae477fd28a7d0b624b8109D15d'
  const electroGems = process.env.VITE_ELECTROGEMS_NFT_ADDRESS ?? '0xcff0d88Ed5311bAB09178b6ec19A464100880984'
  const clubWatch = process.env.VITE_CLUB_WATCH_NFT_ADDRESS ?? '0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1'
  const metadataBase =
    process.env.GEM_SHARDS_TOKEN_URI_BASE
    ?? 'https://sktexilttapijefdusni.supabase.co/functions/v1/gem-shard-metadata/'

  console.log('Deploying Gem Shards stack on', networkName, 'with', wallet.address)

  const distributorFactory = new ethers.ContractFactory(
    loadArtifact('PublishFeeDistributor').abi,
    loadArtifact('PublishFeeDistributor').bytecode,
    wallet,
  )
  const distributor = await distributorFactory.deploy(wallet.address, treasury)
  const distributorReceipt = await waitForTx(provider, distributor.deploymentTransaction().hash, 'PublishFeeDistributor')
  const distributorAddress = distributorReceipt.contractAddress
  console.log('PublishFeeDistributor:', distributorAddress)

  const gemFactory = new ethers.ContractFactory(
    loadArtifact('GemShards').abi,
    loadArtifact('GemShards').bytecode,
    wallet,
  )
  const gemShards = await gemFactory.deploy(
    wallet.address,
    distributorAddress,
    metadataBase,
    electroGems,
    clubWatch,
  )
  const gemReceipt = await waitForTx(provider, gemShards.deploymentTransaction().hash, 'GemShards')
  const gemShardsAddress = gemReceipt.contractAddress
  console.log('GemShards:', gemShardsAddress)

  const gemContract = new ethers.Contract(gemShardsAddress, loadArtifact('GemShards').abi, wallet)
  await waitForTx(provider, (await gemContract.setDistributor(distributorAddress)).hash, 'setDistributor')

  const distributorContract = new ethers.Contract(
    distributorAddress,
    loadArtifact('PublishFeeDistributor').abi,
    wallet,
  )
  await waitForTx(provider, (await distributorContract.setGemShards(gemShardsAddress)).hash, 'setGemShards')

  const minterFactory = new ethers.ContractFactory(
    loadArtifact('LaunchpadMinter').abi,
    loadArtifact('LaunchpadMinter').bytecode,
    wallet,
  )
  const minter = await minterFactory.deploy(300, distributorAddress, electroGems, clubWatch)
  const minterReceipt = await waitForTx(provider, minter.deploymentTransaction().hash, 'LaunchpadMinter')
  const minterAddress = minterReceipt.contractAddress
  console.log('LaunchpadMinter:', minterAddress)

  const deploymentsPath = path.join(__dirname, '..', 'deployments.json')
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))
  deployments[network.deploymentsKey].PublishFeeDistributor = distributorAddress
  deployments[network.deploymentsKey].GemShards = gemShardsAddress
  deployments[network.deploymentsKey].LaunchpadMinter = minterAddress
  deployments[network.deploymentsKey].gemShardsDeployedAt = new Date().toISOString()
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2))

  const configKey = network.configKey
  console.log('\nplatform_config SQL:')
  console.log(
    `INSERT INTO platform_config (key, value) VALUES ('gem_shards_${configKey}', '${gemShardsAddress}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
  )
  console.log(
    `INSERT INTO platform_config (key, value) VALUES ('publish_fee_distributor_${configKey}', '${distributorAddress}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
  )
  console.log(
    `INSERT INTO platform_config (key, value) VALUES ('launchpad_minter_${configKey}', '${minterAddress}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
  )
  console.log(
    `UPDATE collections SET contract_address = '${gemShardsAddress.toLowerCase()}' WHERE symbol = 'GSHARD' AND chain_id = ${network.chainId};`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
