const { ethers } = require('hardhat')
const fs = require('fs')
const path = require('path')
const { CLUB_TOKEN, getDeploymentAddresses } = require('./chain-addresses.cjs')

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  }
}

async function deployFactory(FactoryName, deployer, clubToken, wetn, swapRouter, publishFee) {
  const Factory = await ethers.getContractFactory(FactoryName)
  const factory = await Factory.deploy(deployer.address, deployer.address, clubToken, wetn, swapRouter, publishFee, 500)
  const deployTx = factory.deploymentTransaction()
  if (!deployTx) throw new Error(`${FactoryName} deployment transaction missing`)
  console.log(`${FactoryName} deploy tx:`, deployTx.hash)
  await deployTx.wait()
  const address = await factory.getAddress()
  console.log(`${FactoryName} deployed to:`, address)
  return { address, factory, deployTx }
}

async function main() {
  loadEnvFile()
  const [deployer] = await ethers.getSigners()
  const network = await ethers.provider.getNetwork()
  const chainId = Number(network.chainId)
  const publishFee = chainId === 52014 ? ethers.parseEther('1000') : ethers.parseEther('1')
  const { wetn, swapRouter } = getDeploymentAddresses(chainId)
  const configKey = chainId === 52014 ? 'mainnet' : 'testnet'

  console.log('Deploying V2 factories with:', deployer.address, 'on chain', chainId)

  const erc721 = await deployFactory(
    'LaunchpadFactoryERC721V2',
    deployer,
    CLUB_TOKEN,
    wetn,
    swapRouter,
    publishFee,
  )
  const erc1155 = await deployFactory(
    'LaunchpadFactoryERC1155',
    deployer,
    CLUB_TOKEN,
    wetn,
    swapRouter,
    publishFee,
  )

  const electroGems =
    process.env.FACTORY_ELECTROGEMS_NFT ?? '0xcff0d88Ed5311bAB09178b6ec19A464100880984'
  const clubWatch =
    process.env.FACTORY_CLUB_WATCH_NFT ?? '0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1'
  const dualHolderDiscountBps = BigInt(process.env.FACTORY_DUAL_HOLDER_DISCOUNT_BPS ?? '5000')

  for (const entry of [
    { label: 'ERC721 V2', factory: erc721.factory },
    { label: 'ERC1155', factory: erc1155.factory },
  ]) {
    console.log(`Configuring ${entry.label} factory creator access…`)
    const configTx = await entry.factory.setCreatorAccessConfig(electroGems, clubWatch, dualHolderDiscountBps)
    console.log('setCreatorAccessConfig tx:', configTx.hash)
    await configTx.wait()
  }

  const deploymentsPath = path.join(__dirname, '..', 'deployments.json')
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))
  const key = chainId === 52014 ? 'electroneum' : 'electroneumTestnet'
  deployments[key].LaunchpadFactoryERC721V2 = erc721.address
  deployments[key].LaunchpadFactoryERC1155 = erc1155.address
  deployments[key].v2DeployedAt = new Date().toISOString()
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2))

  console.log('')
  console.log('Register in Supabase platform_config:')
  console.log(
    `INSERT INTO platform_config (key, value) VALUES ('factory_address_v2_erc721_${configKey}', '${erc721.address}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
  )
  console.log(
    `INSERT INTO platform_config (key, value) VALUES ('factory_address_v2_erc1155_${configKey}', '${erc1155.address}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
