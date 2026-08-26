const { ethers } = require('hardhat')
const fs = require('fs')
const path = require('path')

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
  const chainId = Number((await ethers.provider.getNetwork()).chainId)
  const configKey = chainId === 52014 ? 'mainnet' : 'testnet'

  const electroGems = '0xcff0d88Ed5311bAB09178b6ec19A464100880984'
  const clubWatch = '0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1'
  const treasury = process.env.VITE_TREASURY_ADDRESS ?? '0x126aa663BdeDd6Ae477fd28a7d0b624b8109D15d'

  console.log('Deploying LaunchpadMinter with:', deployer.address, 'on chain', chainId)

  const LaunchpadMinter = await ethers.getContractFactory('LaunchpadMinter')
  const minter = await LaunchpadMinter.deploy(300, treasury, electroGems, clubWatch)
  const deployTx = minter.deploymentTransaction()
  if (!deployTx) throw new Error('LaunchpadMinter deployment transaction missing')
  console.log('LaunchpadMinter deploy tx:', deployTx.hash)
  await deployTx.wait()

  const address = await minter.getAddress()
  console.log('LaunchpadMinter deployed to:', address)
  const deploymentsPath = path.join(__dirname, '..', 'deployments.json')
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))
  const key = chainId === 52014 ? 'electroneum' : 'electroneumTestnet'
  deployments[key].LaunchpadMinter = address
  deployments[key].launchpadMinterDeployedAt = new Date().toISOString()
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2))

  console.log('')
  console.log('Register in Supabase platform_config:')
  console.log(
    `INSERT INTO platform_config (key, value) VALUES ('launchpad_minter_${configKey}', '${address}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
  )
  console.log(`VITE_LAUNCHPAD_MINTER_${configKey.toUpperCase()}=${address}`)
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
