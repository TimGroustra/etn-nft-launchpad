import { ethers } from 'hardhat'

const CLUB_TOKEN = '0xC9FC4AB00911793D99b5c7Bd01f01203C21D4131'
const WETN_MAINNET = '0x138DAFbDA0CCB3d8E39C19edb0510Fc31b7C1c77'
/** ElectroSwap SwapRouter02 — V3 exactInput; NOT the V3 Liquidity Locker. */
const SWAP_ROUTER_V3_MAINNET = '0x5A3AB7e9f405250B36e7e0a4654c1052EADC1F07'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

async function main() {
  const [deployer] = await ethers.getSigners()
  const network = await ethers.provider.getNetwork()
  const chainId = Number(network.chainId)
  const publishFee = chainId === 52014 ? ethers.parseEther('1000') : ethers.parseEther('1')
  const wetn = chainId === 52014 ? WETN_MAINNET : ZERO_ADDRESS
  const swapRouter = chainId === 52014 ? SWAP_ROUTER_V3_MAINNET : ZERO_ADDRESS
  console.log('Deploying with:', deployer.address, 'on chain', chainId, 'publish fee:', ethers.formatEther(publishFee), 'ETN')

  const Factory = await ethers.getContractFactory('LaunchpadFactory')
  const factory = await Factory.deploy(deployer.address, deployer.address, CLUB_TOKEN, wetn, swapRouter, publishFee, 500)
  await factory.waitForDeployment()

  console.log('LaunchpadFactory deployed to:', await factory.getAddress())
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
