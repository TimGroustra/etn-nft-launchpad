const { expect } = require('chai')
const { ethers } = require('hardhat')

const CLUB_TOKEN = '0xC9FC4AB00911793D99b5c7Bd01f01203C21D4131'
const DEAD = '0x000000000000000000000000000000000000dEaD'

async function waitDeployed(contract) {
  const tx = contract.deploymentTransaction()
  if (!tx) throw new Error('Missing deployment transaction')
  await tx.wait()
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

async function deployFactory(Factory, args) {
  return waitDeployed(await Factory.deploy(...args))
}

describe('LaunchpadFactory', function () {
  it('deploys a collection when publish fee is paid', async function () {
    const [owner, creator] = await ethers.getSigners()
    const { wetn, router } = await deploySwapMocks()
    const Factory = await ethers.getContractFactory('LaunchpadFactory')
    const publishFee = ethers.parseEther('1')
    const factory = await deployFactory(Factory, [
      owner.address,
      owner.address,
      CLUB_TOKEN,
      await wetn.getAddress(),
      await router.getAddress(),
      publishFee,
      500,
    ])

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
    const factory = await deployFactory(Factory, [
      owner.address,
      owner.address,
      CLUB_TOKEN,
      await wetn.getAddress(),
      await router.getAddress(),
      publishFee,
      500,
    ])

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

  it('uses updated factory deployment config for new collections only', async function () {
    const [owner, creator] = await ethers.getSigners()
    const { wetn, club, router } = await deploySwapMocks()
    const Factory = await ethers.getContractFactory('LaunchpadFactory')
    const publishFee = ethers.parseEther('1')
    const factory = await deployFactory(Factory, [
      owner.address,
      owner.address,
      await club.getAddress(),
      await wetn.getAddress(),
      await router.getAddress(),
      publishFee,
      500,
    ])

    const burnConfig = { clubBurnAmount: 0n, burnOnMint: false, royaltyBurnBps: 0 }
    const tx1 = await factory.connect(creator).deployCollection('First', 'ONE', burnConfig, 5, {
      value: publishFee,
    })
    const receipt1 = await tx1.wait()
    const first = receipt1.logs.find((log) => log.fragment?.name === 'CollectionDeployed').args.collection
    const nft1 = await ethers.getContractAt('EditableERC721', first)
    expect(await nft1.clubToken()).to.equal(await club.getAddress())

    const MockClub2 = await ethers.getContractFactory('MockClub')
    const club2 = await waitDeployed(await MockClub2.deploy())
    await factory.connect(owner).setDeploymentConfig(
      await club2.getAddress(),
      await wetn.getAddress(),
      await router.getAddress(),
      750,
    )

    const tx2 = await factory.connect(creator).deployCollection('Second', 'TWO', burnConfig, 5, {
      value: publishFee,
    })
    const receipt2 = await tx2.wait()
    const second = receipt2.logs.find((log) => log.fragment?.name === 'CollectionDeployed').args.collection
    const nft2 = await ethers.getContractAt('EditableERC721', second)

    expect(await nft1.clubToken()).to.equal(await club.getAddress())
    expect(await nft2.clubToken()).to.equal(await club2.getAddress())
    expect(await factory.defaultRoyaltyBps()).to.equal(750n)
  })

  it('allows owner to update publish fee without redeploying factory', async function () {
    const [owner, creator] = await ethers.getSigners()
    const { wetn, router } = await deploySwapMocks()
    const Factory = await ethers.getContractFactory('LaunchpadFactory')
    const factory = await deployFactory(Factory, [
      owner.address,
      owner.address,
      CLUB_TOKEN,
      await wetn.getAddress(),
      await router.getAddress(),
      ethers.parseEther('1'),
      500,
    ])

    await factory.connect(owner).setPublishFee(ethers.parseEther('2'))
    expect(await factory.publishFee()).to.equal(ethers.parseEther('2'))

    const burnConfig = { clubBurnAmount: 0n, burnOnMint: false, royaltyBurnBps: 0 }
    await expect(
      factory.connect(creator).deployCollection('Fee', 'FEE', burnConfig, 1, { value: ethers.parseEther('1') }),
    ).to.be.revertedWith('Insufficient publish fee')

    await factory.connect(creator).deployCollection('Fee', 'FEE', burnConfig, 1, { value: ethers.parseEther('2') })
  })
})

describe('EditableERC721', function () {
  async function deployNft(burnConfig, owner) {
    const { wetn, club, router } = await deploySwapMocks()
    const NFT = await ethers.getContractFactory('EditableERC721')
    const nft = await waitDeployed(
      await NFT.deploy(
        'Editable',
        'EDT',
        owner.address,
        await club.getAddress(),
        await wetn.getAddress(),
        await router.getAddress(),
        burnConfig,
        10,
        500,
      ),
    )
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
