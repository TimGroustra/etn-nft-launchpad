const { ethers } = require('hardhat')
const fs = require('fs')
const path = require('path')
const { CLUB_TOKEN, getDeploymentAddresses } = require('./chain-addresses.cjs')

const ERC721_FACTORY = process.env.ERC721_FACTORY_ADDRESS ?? '0xaaAe79CB57aAe3bD89d22FC7ADd19C1B0780c63C'

async function main() {
  const [deployer] = await ethers.getSigners()
  const chainId = Number((await ethers.provider.getNetwork()).chainId)
  const publishFee = chainId === 52014 ? ethers.parseEther('1000') : ethers.parseEther('1')
  const { wetn, swapRouter } = getDeploymentAddresses(chainId)
  const configKey = chainId === 52014 ? 'mainnet' : 'testnet'

  const Factory = await ethers.getContractFactory('LaunchpadFactoryERC1155')
  const factory = await Factory.deploy(
    deployer.address,
    deployer.address,
    CLUB_TOKEN,
    wetn,
    swapRouter,
    publishFee,
    500,
  )
  const deployTx = factory.deploymentTransaction()
  console.log('LaunchpadFactoryERC1155 deploy tx:', deployTx.hash)

  const electroGems = '0xcff0d88Ed5311bAB09178b6ec19A464100880984'
  const clubWatch = '0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1'
  const dualHolderDiscountBps = 5000n

  for (const entry of [
    { label: 'ERC721 V2', address: ERC721_FACTORY, name: 'LaunchpadFactoryERC721V2' },
    { label: 'ERC1155', address: await factory.getAddress(), name: 'LaunchpadFactoryERC1155' },
  ]) {
    const contract = await ethers.getContractAt(entry.name, entry.address)
    const tx = await contract.setCreatorAccessConfig(electroGems, clubWatch, dualHolderDiscountBps)
    console.log(`${entry.label} setCreatorAccessConfig tx:`, tx.hash)
  }

  const erc1155Address = await factory.getAddress()
  const deploymentsPath = path.join(__dirname, '..', 'deployments.json')
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))
  const key = chainId === 52014 ? 'electroneum' : 'electroneumTestnet'
  deployments[key].LaunchpadFactoryERC721V2 = ERC721_FACTORY
  deployments[key].LaunchpadFactoryERC1155 = erc1155Address
  deployments[key].v2DeployedAt = new Date().toISOString()
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2))

  console.log('factory_address_v2_erc721_' + configKey, ERC721_FACTORY)
  console.log('factory_address_v2_erc1155_' + configKey, erc1155Address)
  console.log('ERC1155 deploy tx for polling:', deployTx.hash)
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
