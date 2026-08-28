const fs = require('fs')
const path = require('path')
const { ethers } = require('ethers')
const { loadEnvFiles } = require('./load-env.cjs')

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
  const rpc =
    networkName === 'testnet'
      ? 'https://rpc.ankr.com/electroneum_testnet'
      : process.env.ELECTRONEUM_MAINNET_RPC ?? 'https://rpc.ankr.com/electroneum'
  const chainId = networkName === 'testnet' ? 5201420 : 52014
  const deploymentsKey = networkName === 'testnet' ? 'electroneumTestnet' : 'electroneum'

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY
  if (!privateKey) throw new Error('DEPLOYER_PRIVATE_KEY missing')

  const deploymentsPath = path.join(__dirname, '..', 'deployments.json')
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))
  const networkDeployments = deployments[deploymentsKey]
  const distributorAddress = networkDeployments.PublishFeeDistributor
  if (!distributorAddress) throw new Error('PublishFeeDistributor missing from deployments.json')

  const provider = new ethers.JsonRpcProvider(rpc, chainId)
  const wallet = new ethers.Wallet(privateKey, provider)
  const metadataBase =
    process.env.GEM_SHARDS_TOKEN_URI_BASE
    ?? 'https://sktexilttapijefdusni.supabase.co/functions/v1/gem-shard-metadata/'
  const electroGems = process.env.VITE_ELECTROGEMS_NFT_ADDRESS ?? '0xcff0d88Ed5311bAB09178b6ec19A464100880984'
  const clubWatch = process.env.VITE_CLUB_WATCH_NFT_ADDRESS ?? '0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1'

  console.log(`Redeploying GemShards on ${networkName} (10,000 ETN paid mint)`)
  console.log('Distributor:', distributorAddress)
  console.log('Deployer:', wallet.address)

  const gemFactory = new ethers.ContractFactory(
    loadArtifact('GemShards').abi,
    loadArtifact('GemShards').bytecode,
    wallet,
  )
  const gemShards = await gemFactory.deploy(
    wallet.address,
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

  const previousGemShards = networkDeployments.GemShards
  networkDeployments.GemShards = gemShardsAddress
  networkDeployments.gemShardsDeployedAt = new Date().toISOString()
  if (previousGemShards) networkDeployments.previousGemShards = previousGemShards
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2))

  const configKey = networkName === 'testnet' ? 'testnet' : 'mainnet'
  console.log('\nRun in Supabase:')
  console.log(
    `UPDATE platform_config SET value = '${gemShardsAddress}' WHERE key = 'gem_shards_${configKey}';`,
  )
  console.log(
    `UPDATE collections SET contract_address = '${gemShardsAddress.toLowerCase()}', mint_price_etn = 10000 WHERE symbol = 'GSHARD' AND chain_id = ${chainId};`,
  )
  console.log(`\nVITE_GEM_SHARDS_ADDRESS_MAINNET=${gemShardsAddress}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
