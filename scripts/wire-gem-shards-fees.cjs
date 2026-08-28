const { ethers } = require('ethers')
const fs = require('fs')
const path = require('path')
const { loadEnvFiles } = require('./load-env.cjs')

const FACTORY_ABI = [
  'function treasury() view returns (address)',
  'function setTreasury(address newTreasury) external',
]

function getDeployments(network) {
  const deployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'deployments.json'), 'utf8'),
  )
  return network === 'mainnet' ? deployments.electroneum : deployments.electroneumTestnet
}

async function setTreasuryOnFactory(provider, wallet, factoryAddress, distributorAddress, label) {
  if (!factoryAddress) {
    console.log(`Skipping ${label}: no factory address`)
    return
  }
  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, wallet)
  const current = await factory.treasury()
  if (current.toLowerCase() === distributorAddress.toLowerCase()) {
    console.log(`${label}: treasury already set to distributor`)
    return
  }
  console.log(`${label}: setTreasury(${distributorAddress}) from ${current}`)
  const tx = await factory.setTreasury(distributorAddress)
  await tx.wait()
  console.log(`${label}: done (${tx.hash})`)
}

async function main() {
  loadEnvFiles(path.join(__dirname, '..'))
  const network = process.argv[2] === 'testnet' ? 'testnet' : 'mainnet'
  const RPC = {
    testnet: 'https://rpc.ankr.com/electroneum_testnet',
    mainnet: process.env.ELECTRONEUM_MAINNET_RPC ?? 'https://rpc.ankr.com/electroneum',
  }
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY
  if (!privateKey) throw new Error('Set DEPLOYER_PRIVATE_KEY')

  const deployments = getDeployments(network)
  const distributorAddress = process.env.DISTRIBUTOR_ADDRESS ?? deployments.PublishFeeDistributor
  if (!distributorAddress) {
    throw new Error('PublishFeeDistributor address missing — run deploy-gem-shards first')
  }

  const provider = new ethers.JsonRpcProvider(RPC[network])
  const wallet = new ethers.Wallet(privateKey, provider)

  console.log('Network:', network)
  console.log('Distributor:', distributorAddress)
  console.log('Owner wallet:', wallet.address)

  await setTreasuryOnFactory(
    provider,
    wallet,
    deployments.LaunchpadFactory,
    distributorAddress,
    'LaunchpadFactory',
  )
  await setTreasuryOnFactory(
    provider,
    wallet,
    deployments.LaunchpadFactoryERC721V2,
    distributorAddress,
    'LaunchpadFactoryERC721V2',
  )
  await setTreasuryOnFactory(
    provider,
    wallet,
    deployments.LaunchpadFactoryERC1155,
    distributorAddress,
    'LaunchpadFactoryERC1155',
  )

  console.log('')
  console.log('Fee wiring complete. Platform mint fees route through the new LaunchpadMinter from deploy-gem-shards.cjs.')
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
