const { ethers } = require('hardhat')
const fs = require('fs')
const path = require('path')

const CLUB_TOKEN = '0xC9FC4AB00911793D99b5c7Bd01f01203C21D4131'

async function main() {
  const [deployer] = await ethers.getSigners()
  const network = await ethers.provider.getNetwork()
  const chainId = Number(network.chainId)
  const publishFee = chainId === 52014 ? ethers.parseEther('1000') : ethers.parseEther('1')
  console.log('Deploying with:', deployer.address, 'on chain', chainId, 'publish fee:', ethers.formatEther(publishFee), 'ETN')

  const Factory = await ethers.getContractFactory('LaunchpadFactory')
  const factory = await Factory.deploy(deployer.address, deployer.address, CLUB_TOKEN, publishFee)
  await factory.waitForDeployment()

  const address = await factory.getAddress()
  const key = Number(network.chainId) === 52014 ? 'electroneum' : 'electroneumTestnet'
  const configKey = key === 'electroneum' ? 'mainnet' : 'testnet'

  console.log('LaunchpadFactory deployed to:', address)
  console.log('')
  console.log('Register in Supabase platform_config:')
  console.log(`UPDATE platform_config SET value = '${address}' WHERE key = 'factory_address_${configKey}';`)

  const deploymentsPath = path.join(__dirname, '..', 'deployments.json')
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))
  deployments[key].LaunchpadFactory = address
  deployments[key].deployedAt = new Date().toISOString()
  deployments[key].deployer = deployer.address
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2))
  console.log('Updated deployments.json')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
