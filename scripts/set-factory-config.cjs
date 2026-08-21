const { ethers } = require('ethers')
const fs = require('fs')
const path = require('path')

const RPC = {
  testnet: 'https://rpc.ankr.com/electroneum_testnet',
  mainnet: 'https://rpc.electroneum.com',
}

const FACTORY_ABI = [
  'function publishFee() view returns (uint256)',
  'function treasury() view returns (address)',
  'function clubToken() view returns (address)',
  'function wetn() view returns (address)',
  'function swapRouter() view returns (address)',
  'function defaultRoyaltyBps() view returns (uint96)',
  'function setPublishFee(uint256 newFee) external',
  'function setTreasury(address newTreasury) external',
  'function setClubToken(address newClubToken) external',
  'function setWetn(address newWetn) external',
  'function setSwapRouter(address newSwapRouter) external',
  'function setDefaultRoyaltyBps(uint96 newBps) external',
  'function setDeploymentConfig(address clubToken_, address wetn_, address swapRouter_, uint96 defaultRoyaltyBps_) external',
]

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  }
}

function getFactoryAddress(network) {
  if (process.env.FACTORY_ADDRESS) return process.env.FACTORY_ADDRESS
  const deployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'deployments.json'), 'utf8'),
  )
  return network === 'mainnet'
    ? deployments.electroneum?.LaunchpadFactory
    : deployments.electroneumTestnet?.LaunchpadFactory
}

async function main() {
  loadEnvFile()
  const network = process.argv[2] === 'mainnet' ? 'mainnet' : 'testnet'
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY
  if (!privateKey) throw new Error('Set DEPLOYER_PRIVATE_KEY')

  const factoryAddress = getFactoryAddress(network)
  if (!factoryAddress || factoryAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error(`Factory address missing for ${network}`)
  }

  const provider = new ethers.JsonRpcProvider(RPC[network])
  const wallet = new ethers.Wallet(privateKey, provider)
  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, wallet)

  console.log('Network:', network)
  console.log('Factory:', factoryAddress)
  console.log('Owner wallet:', wallet.address)
  console.log('Current config:')
  console.log('  publishFee:', ethers.formatEther(await factory.publishFee()), 'ETN')
  console.log('  treasury:', await factory.treasury())
  console.log('  clubToken:', await factory.clubToken())
  console.log('  wetn:', await factory.wetn())
  console.log('  swapRouter:', await factory.swapRouter())
  console.log('  defaultRoyaltyBps:', (await factory.defaultRoyaltyBps()).toString())

  const publishFeeEtn = process.env.FACTORY_PUBLISH_FEE_ETN
  const treasury = process.env.FACTORY_TREASURY
  const clubToken = process.env.FACTORY_CLUB_TOKEN
  const wetn = process.env.FACTORY_WETN
  const swapRouter = process.env.FACTORY_SWAP_ROUTER
  const royaltyBps = process.env.FACTORY_DEFAULT_ROYALTY_BPS

  if (publishFeeEtn) {
    const tx = await factory.setPublishFee(ethers.parseEther(publishFeeEtn))
    console.log('setPublishFee tx:', tx.hash)
    await tx.wait()
  }

  if (treasury) {
    const tx = await factory.setTreasury(treasury)
    console.log('setTreasury tx:', tx.hash)
    await tx.wait()
  }

  if (clubToken) {
    const tx = await factory.setClubToken(clubToken)
    console.log('setClubToken tx:', tx.hash)
    await tx.wait()
  }

  if (wetn !== undefined) {
    const tx = await factory.setWetn(wetn || ethers.ZeroAddress)
    console.log('setWetn tx:', tx.hash)
    await tx.wait()
  }

  if (swapRouter !== undefined) {
    const tx = await factory.setSwapRouter(swapRouter || ethers.ZeroAddress)
    console.log('setSwapRouter tx:', tx.hash)
    await tx.wait()
  }

  if (royaltyBps) {
    const tx = await factory.setDefaultRoyaltyBps(BigInt(royaltyBps))
    console.log('setDefaultRoyaltyBps tx:', tx.hash)
    await tx.wait()
  }

  if (!publishFeeEtn && !treasury && !clubToken && wetn === undefined && swapRouter === undefined && !royaltyBps) {
    console.log('')
    console.log('No updates requested. Set any of:')
    console.log('  FACTORY_PUBLISH_FEE_ETN, FACTORY_TREASURY, FACTORY_CLUB_TOKEN,')
    console.log('  FACTORY_WETN, FACTORY_SWAP_ROUTER, FACTORY_DEFAULT_ROYALTY_BPS')
    return
  }

  console.log('')
  console.log('Updated config:')
  console.log('  publishFee:', ethers.formatEther(await factory.publishFee()), 'ETN')
  console.log('  treasury:', await factory.treasury())
  console.log('  clubToken:', await factory.clubToken())
  console.log('  wetn:', await factory.wetn())
  console.log('  swapRouter:', await factory.swapRouter())
  console.log('  defaultRoyaltyBps:', (await factory.defaultRoyaltyBps()).toString())
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
