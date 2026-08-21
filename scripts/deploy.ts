import { ethers } from 'hardhat'

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

  console.log('LaunchpadFactory deployed to:', await factory.getAddress())
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
