const { ethers } = require('ethers')
const fs = require('fs')
const path = require('path')

const RPC_TESTNET = 'https://rpc.ankr.com/electroneum_testnet'

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  }
}

function getFactoryAddress() {
  if (process.env.FACTORY_ADDRESS) return process.env.FACTORY_ADDRESS
  const deployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'deployments.json'), 'utf8'),
  )
  return deployments.electroneumTestnet.LaunchpadFactory
}

async function main() {
  loadEnvFile()
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY
  if (!privateKey) throw new Error('Set DEPLOYER_PRIVATE_KEY')

  const factoryAddress = getFactoryAddress()
  const provider = new ethers.JsonRpcProvider(RPC_TESTNET)
  const wallet = new ethers.Wallet(privateKey, provider)
  const factory = new ethers.Contract(
    factoryAddress,
    ['function publishFee() view returns (uint256)', 'function setPublishFee(uint256 newFee) external'],
    wallet,
  )

  const current = await factory.publishFee()
  const next = ethers.parseEther('1')
  console.log('Factory:', factoryAddress)
  console.log('Owner wallet:', wallet.address)
  console.log('Current fee:', ethers.formatEther(current), 'ETN')
  console.log('Setting fee to:', ethers.formatEther(next), 'ETN')

  const tx = await factory.setPublishFee(next)
  console.log('Tx:', tx.hash)
  await tx.wait()
  console.log('Done. New fee:', ethers.formatEther(await factory.publishFee()), 'ETN')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
