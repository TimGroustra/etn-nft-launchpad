const { ethers } = require('hardhat')
const fs = require('fs')
const path = require('path')
const {
  CLUB_TOKEN,
  getDeploymentAddresses,
} = require('./chain-addresses.cjs')

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
  const { wetn, swapRouter } = getDeploymentAddresses(chainId)
  console.log('Deploying with:', deployer.address, 'on chain', chainId, 'publish fee:', ethers.formatEther(publishFee), 'ETN')
  console.log('WETN:', wetn, 'swapRouter:', swapRouter)

  const Factory = await ethers.getContractFactory('LaunchpadFactory')
  const factory = await Factory.deploy(deployer.address, deployer.address, CLUB_TOKEN, wetn, swapRouter, publishFee, 500)
  const deployTx = factory.deploymentTransaction()
  if (!deployTx) throw new Error('Factory deployment transaction missing')
  console.log('Deploy tx:', deployTx.hash)
  const provider = ethers.provider
  let receipt = null
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    receipt = await provider.getTransactionReceipt(deployTx.hash)
    if (receipt) break
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  if (!receipt?.contractAddress) throw new Error(`Factory deployment receipt missing for ${deployTx.hash}`)

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
  deployments[key].swapRouter = swapRouter
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2))
  console.log('Updated deployments.json')

  const hre = require('hardhat')
  if (process.env.SKIP_VERIFY !== '1') {
    console.log('Verifying factory on block explorer…')
    try {
      await hre.run('verify:verify', {
        address,
        constructorArguments: [deployer.address, deployer.address, CLUB_TOKEN, wetn, swapRouter, publishFee, 500],
      })
      console.log('Factory verified.')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.toLowerCase().includes('already verified')) {
        console.log('Factory already verified.')
      } else {
        console.warn('Factory verification failed:', message)
        console.warn('Re-run: npx hardhat verify --network', key === 'electroneum' ? 'electroneum' : 'electroneumTestnet', address, ...)
      }
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
