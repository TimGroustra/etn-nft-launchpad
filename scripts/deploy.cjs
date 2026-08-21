const { ethers } = require('hardhat')
const fs = require('fs')
const path = require('path')
const CLUB_TOKEN = '0xC9FC4AB00911793D99b5c7Bd01f01203C21D4131'
const WETN_MAINNET = '0x138DAFbDA0CCB3d8E39C19edb0510Fc31b7C1c77'
const SWAP_ROUTER_V3_MAINNET = '0xfdB0d62Fc929fD53D266B969Bfe4250b205D0899'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

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
  const [deployer] = await ethers.getSigners()
  const network = await ethers.provider.getNetwork()
  const chainId = Number(network.chainId)
  const publishFee = chainId === 52014 ? ethers.parseEther('1000') : ethers.parseEther('1')
  const wetn = chainId === 52014 ? WETN_MAINNET : ZERO_ADDRESS
  const swapRouter = chainId === 52014 ? SWAP_ROUTER_V3_MAINNET : ZERO_ADDRESS
  console.log('Deploying with:', deployer.address, 'on chain', chainId, 'publish fee:', ethers.formatEther(publishFee), 'ETN')

  const Factory = await ethers.getContractFactory('LaunchpadFactory')
  const factory = await Factory.deploy(deployer.address, deployer.address, CLUB_TOKEN, wetn, swapRouter, publishFee)
  const deployTx = factory.deploymentTransaction()
  if (!deployTx) throw new Error('Factory deployment transaction missing')
  console.log('Deploy tx:', deployTx.hash)
  const receipt = await deployTx.wait()
  if (!receipt?.contractAddress) throw new Error('Factory deployment failed')

  const address = receipt.contractAddress
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
  deployments[key].txHash = deployTx.hash
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2))
  console.log('Updated deployments.json')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
