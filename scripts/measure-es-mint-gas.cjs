const { ethers } = require('hardhat')

const ES_MINTER = '0x41B8c31e35317124a7a4895ea034538C213c060f'
const DEAD = '0x000000000000000000000000000000000000dEaD'

async function waitDeployed(contract) {
  await contract.deploymentTransaction().wait()
  return contract
}

async function deploySwapMocks() {
  const MockWETN = await ethers.getContractFactory('MockWETN')
  const wetn = await waitDeployed(await MockWETN.deploy())
  const MockClub = await ethers.getContractFactory('MockClub')
  const club = await waitDeployed(await MockClub.deploy())
  const MockSwapRouterV3 = await ethers.getContractFactory('MockSwapRouterV3')
  const router = await waitDeployed(
    await MockSwapRouterV3.deploy(await club.getAddress(), await wetn.getAddress(), DEAD),
  )
  await club.transfer(await router.getAddress(), ethers.parseEther('1000000'))
  return { wetn, club, router }
}

async function deployV2() {
  const [owner] = await ethers.getSigners()
  const { wetn, club, router } = await deploySwapMocks()
  const NFT = await ethers.getContractFactory('EditableERC721V2')
  const nft = await waitDeployed(
    await NFT.deploy(
      'Test',
      'TST',
      owner.address,
      await club.getAddress(),
      await wetn.getAddress(),
      await router.getAddress(),
      { royaltyBurnBps: 0, mintBurnBps: 0, burnOnMint: false },
      10,
      500,
      owner.address,
      300,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
    ),
  )
  await nft.setBaseURI('ipfs://collection/')
  await nft.setMintPrice(ethers.parseEther('1'))
  await nft.setRandomPublicMint(true)
  await nft.setMintable(true)
  await nft.ownerMint(owner.address, '1.json')
  return { nft, owner }
}

async function installEsMinterRuntime() {
  const MockEsMinter = await ethers.getContractFactory('MockEsMinter')
  const mock = await waitDeployed(await MockEsMinter.deploy())
  const code = await ethers.provider.getCode(await mock.getAddress())
  await ethers.provider.send('hardhat_setCode', [ES_MINTER, code])
}

async function measureEsPath(qty) {
  const [owner, buyer] = await ethers.getSigners()
  const { nft } = await deployV2()

  await installEsMinterRuntime()
  await ethers.provider.send('hardhat_impersonateAccount', [ES_MINTER])
  await owner.sendTransaction({ to: ES_MINTER, value: ethers.parseEther('10') })
  const es = await ethers.getSigner(ES_MINTER)
  const esContract = await ethers.getContractAt('MockEsMinter', ES_MINTER, es)

  const base = ethers.parseEther('1') * BigInt(qty)
  const tx = await esContract.mint(await nft.getAddress(), qty, await buyer.getAddress(), {
    value: base,
    gasLimit: 5_000_000n,
  })
  const receipt = await tx.wait()

  const total = receipt.gasUsed
  const mainnetEst = (total * 145n) / 100n
  console.log(`qty=${qty}: total=${total} (~${mainnetEst} mainnet est)`)

  await ethers.provider.send('hardhat_stopImpersonatingAccount', [ES_MINTER])
}

async function main() {
  for (const qty of [1, 2, 3, 4, 5]) {
    await measureEsPath(qty)
  }
}

main().catch(console.error)
