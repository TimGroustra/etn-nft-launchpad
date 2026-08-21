const { expect } = require('chai')
const { ethers } = require('hardhat')

const CLUB_TOKEN = '0xC9FC4AB00911793D99b5c7Bd01f01203C21D4131'
const DEAD = '0x000000000000000000000000000000000000dEaD'

async function deploySwapMocks() {
  const MockWETN = await ethers.getContractFactory('MockWETN')
  const wetn = await MockWETN.deploy()
  await wetn.waitForDeployment()

  const MockClub = await ethers.getContractFactory('MockClub')
  const club = await MockClub.deploy()
  await club.waitForDeployment()

  const MockSwapRouterV3 = await ethers.getContractFactory('MockSwapRouterV3')
  const router = await MockSwapRouterV3.deploy(await club.getAddress(), await wetn.getAddress(), DEAD)
  await router.waitForDeployment()

  await club.transfer(await router.getAddress(), ethers.parseEther('1000000'))

  return { wetn, club, router }
}

describe('LaunchpadFactory', function () {
  it('deploys a collection when publish fee is paid', async function () {
    const [owner, creator] = await ethers.getSigners()
    const { wetn, router } = await deploySwapMocks()
    const Factory = await ethers.getContractFactory('LaunchpadFactory')
    const publishFee = ethers.parseEther('1')
    const factory = await Factory.deploy(
      owner.address,
      owner.address,
      CLUB_TOKEN,
      await wetn.getAddress(),
      await router.getAddress(),
      publishFee,
    )
    await factory.waitForDeployment()

    const burnConfig = {
      clubBurnAmount: 0n,
      burnOnMint: false,
      royaltyBurnBps: 0,
    }

    const tx = await factory.connect(creator).deployCollection('Test', 'TST', burnConfig, 100, {
      value: publishFee,
    })
    const receipt = await tx.wait()
    const event = receipt.logs.find((log) => log.fragment?.name === 'CollectionDeployed')
    expect(event).to.not.equal(undefined)

    expect(await factory.deployedCollectionsCount()).to.equal(1n)
  })

  it('transfers collection ownership to the publisher', async function () {
    const [owner, creator] = await ethers.getSigners()
    const { wetn, router } = await deploySwapMocks()
    const Factory = await ethers.getContractFactory('LaunchpadFactory')
    const publishFee = ethers.parseEther('1')
    const factory = await Factory.deploy(
      owner.address,
      owner.address,
      CLUB_TOKEN,
      await wetn.getAddress(),
      await router.getAddress(),
      publishFee,
    )
    await factory.waitForDeployment()

    const burnConfig = { clubBurnAmount: 0n, burnOnMint: false, royaltyBurnBps: 0 }
    const tx = await factory.connect(creator).deployCollection('Owned', 'OWN', burnConfig, 10, {
      value: publishFee,
    })
    const receipt = await tx.wait()
    const deployed = receipt.logs.find((log) => log.fragment?.name === 'CollectionDeployed')
    const collectionAddress = deployed.args.collection

    const nft = await ethers.getContractAt('EditableERC721', collectionAddress)
    expect(await nft.owner()).to.equal(creator.address)
  })
})

describe('EditableERC721', function () {
  async function deployNft(burnConfig, owner) {
    const { wetn, club, router } = await deploySwapMocks()
    const NFT = await ethers.getContractFactory('EditableERC721')
    const nft = await NFT.deploy(
      'Editable',
      'EDT',
      owner.address,
      await club.getAddress(),
      await wetn.getAddress(),
      await router.getAddress(),
      burnConfig,
      10,
    )
    await nft.waitForDeployment()
    return { nft, club }
  }

  it('mints with URI and allows owner to update metadata', async function () {
    const [owner, minter] = await ethers.getSigners()
    const { nft } = await deployNft({ clubBurnAmount: 0n, burnOnMint: false, royaltyBurnBps: 0 }, owner)

    await nft.connect(owner).ownerMint(minter.address, 'ipfs://initial')
    expect(await nft.tokenURI(1)).to.equal('ipfs://initial')

    await nft.connect(owner).setTokenURI(1, 'ipfs://updated')
    expect(await nft.tokenURI(1)).to.equal('ipfs://updated')
  })

  it('allows owner to withdraw ETN from the contract', async function () {
    const [owner] = await ethers.getSigners()
    const { nft } = await deployNft({ clubBurnAmount: 0n, burnOnMint: false, royaltyBurnBps: 0 }, owner)

    const amount = ethers.parseEther('1')
    await owner.sendTransaction({ to: await nft.getAddress(), value: amount })

    const before = await ethers.provider.getBalance(owner.address)
    await nft.connect(owner).withdraw()
    const after = await ethers.provider.getBalance(owner.address)

    expect(after).to.be.gt(before)
  })

  it('swaps a royalty share to CLUB and burns it', async function () {
    const [owner, payer] = await ethers.getSigners()
    const { nft, club } = await deployNft(
      { clubBurnAmount: 0n, burnOnMint: false, royaltyBurnBps: 3000 },
      owner,
    )
    const nftAddress = await nft.getAddress()

    const royalty = ethers.parseEther('1')
    await payer.sendTransaction({ to: nftAddress, value: royalty })

    const burnedClub = ethers.parseEther('0.3')
    expect(await club.balanceOf(DEAD)).to.equal(burnedClub)
    expect(await ethers.provider.getBalance(nftAddress)).to.equal(ethers.parseEther('0.7'))
  })

  it('burns CLUB from paid IMintable mint via ETN swap', async function () {
    const [owner, minter] = await ethers.getSigners()
    const { nft, club } = await deployNft(
      { clubBurnAmount: ethers.parseEther('10'), burnOnMint: true, royaltyBurnBps: 0 },
      owner,
    )

    await nft.connect(owner).setBaseURI('ipfs://collection/')
    await nft.connect(owner).setMintPrice(ethers.parseEther('100'))
    await nft.connect(owner).setMintable(true)
    await nft.connect(minter).mint(1, { value: ethers.parseEther('100') })

    expect(await club.balanceOf(DEAD)).to.equal(ethers.parseEther('10'))
    expect(await nft.ownerOf(1)).to.equal(minter.address)
    expect(await nft.tokenURI(1)).to.equal('ipfs://collection/1.json')
  })

  it('exposes ElectroSwap IMintable helpers', async function () {
    const [owner, buyer] = await ethers.getSigners()
    const { nft } = await deployNft({ clubBurnAmount: 0n, burnOnMint: false, royaltyBurnBps: 0 }, owner)

    await nft.connect(owner).setBaseURI('ipfs://collection/')
    await nft.connect(owner).setMintPrice(ethers.parseEther('5'))
    await nft.connect(owner).setMintable(true)
    await nft.connect(owner).setMaxMintPerWallet(2)

    expect(await nft.mintPrice()).to.equal(ethers.parseEther('5'))
    expect(await nft.mintableCount(buyer.address)).to.equal(2n)
  })
})
