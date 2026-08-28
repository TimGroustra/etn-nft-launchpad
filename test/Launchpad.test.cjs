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
      mintBurnBps: 0n,
      burnOnMint: false,
      royaltyBurnBps: 0,
    }

    const tx = await factory.connect(creator).deployCollection('Test', 'TST', burnConfig, 100, {
      value: ethers.parseEther('10'),
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

    const burnConfig = { mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }
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

    const burnConfig = { mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }
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

    const burnConfig = { mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }
    await expect(
      factory.connect(creator).deployCollection('Fee', 'FEE', burnConfig, 1, { value: ethers.parseEther('1') }),
    ).to.be.revertedWith('Insufficient publish fee')

    await factory.connect(creator).deployCollection('Fee', 'FEE', burnConfig, 1, { value: ethers.parseEther('2') })
  })
  it('applies dual-holder publish fee discount when configured', async function () {
    const [owner, creator] = await ethers.getSigners()
    const { wetn, router } = await deploySwapMocks()
    const Factory = await ethers.getContractFactory('LaunchpadFactory')
    const MockHolderNFT = await ethers.getContractFactory('MockHolderNFT')
    const electroGems = await waitDeployed(await MockHolderNFT.deploy())
    const clubWatch = await waitDeployed(await MockHolderNFT.deploy())

    const publishFee = ethers.parseEther('1000')
    const factory = await deployFactory(Factory, [
      owner.address,
      owner.address,
      CLUB_TOKEN,
      await wetn.getAddress(),
      await router.getAddress(),
      publishFee,
      500,
    ])

    await factory
      .connect(owner)
      .setCreatorAccessConfig(await electroGems.getAddress(), await clubWatch.getAddress(), 5000)

    const burnConfig = { mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }
    const discountedFee = ethers.parseEther('500')

    await expect(
      factory.connect(creator).deployCollection('NoDiscount', 'ND', burnConfig, 1, { value: discountedFee }),
    ).to.be.revertedWith('Insufficient publish fee')

    await electroGems.mint(creator.address, 1)
    await clubWatch.mint(creator.address, 1)

    expect(await factory.requiredPublishFee(creator.address, 1)).to.equal(discountedFee)

    const tx = await factory
      .connect(creator)
      .deployCollection('Discounted', 'DSC', burnConfig, 1, { value: discountedFee })
    await tx.wait()
  })

  it('charges tiered publish fee by max supply before dual-holder discount', async function () {
    const [owner, creator] = await ethers.getSigners()
    const { wetn, router } = await deploySwapMocks()
    const Factory = await ethers.getContractFactory('LaunchpadFactory')
    const publishFeePerTen = ethers.parseEther('1000')
    const factory = await deployFactory(Factory, [
      owner.address,
      owner.address,
      CLUB_TOKEN,
      await wetn.getAddress(),
      await router.getAddress(),
      publishFeePerTen,
      500,
    ])

    const burnConfig = { mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }
    const tieredFee = ethers.parseEther('3000')

    await expect(
      factory.connect(creator).deployCollection('Tiered', 'TRD', burnConfig, 25, { value: ethers.parseEther('2000') }),
    ).to.be.revertedWith('Insufficient publish fee')

    expect(await factory.tieredPublishFee(25)).to.equal(tieredFee)
    expect(await factory.requiredPublishFee(creator.address, 25)).to.equal(tieredFee)

    await factory.connect(creator).deployCollection('Tiered', 'TRD', burnConfig, 25, { value: tieredFee })
  })
})

describe('EditableERC721', function () {
  async function deployNft(burnConfig, owner, platform = {}) {
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
        platform.treasury ?? ethers.ZeroAddress,
        platform.platformMintFeeBps ?? 0,
        platform.electroGems ?? ethers.ZeroAddress,
        platform.clubWatch ?? ethers.ZeroAddress,
      ),
    )
    return { nft, club }
  }

  it('mints with URI and allows owner to update metadata', async function () {
    const [owner, minter] = await ethers.getSigners()
    const { nft } = await deployNft({ mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }, owner)

    await nft.connect(owner).ownerMint(minter.address, 'ipfs://initial')
    expect(await nft.tokenURI(1)).to.equal('ipfs://initial')

    await nft.connect(owner).setTokenURI(1, 'ipfs://updated')
    expect(await nft.tokenURI(1)).to.equal('ipfs://updated')
  })

  it('returns absolute token URI when baseURI was set after a full URL was stored', async function () {
    const [owner, minter] = await ethers.getSigners()
    const { nft } = await deployNft({ mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }, owner)

    const absolute = 'https://example.com/collection/4.json'
    await nft.connect(owner).ownerMint(minter.address, absolute)
    await nft.connect(owner).setBaseURI('https://example.com/collection/')

    expect(await nft.tokenURI(1)).to.equal(absolute)
  })

  it('stores relative suffixes under baseURI for owner mint', async function () {
    const [owner, minter] = await ethers.getSigners()
    const { nft } = await deployNft({ mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }, owner)

    await nft.connect(owner).setBaseURI('https://example.com/meta/')
    await nft.connect(owner).ownerMint(minter.address, '1.json')
    expect(await nft.tokenURI(1)).to.equal('https://example.com/meta/1.json')
  })

  it('allows owner to withdraw ETN from the contract', async function () {
    const [owner] = await ethers.getSigners()
    const { nft } = await deployNft({ mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }, owner)

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
      { mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 3000 },
      owner,
    )
    const nftAddress = await nft.getAddress()

    const royalty = ethers.parseEther('1')
    await payer.sendTransaction({ to: nftAddress, value: royalty })

    const burnedClub = ethers.parseEther('0.3')
    expect(await club.balanceOf(DEAD)).to.equal(burnedClub)
    expect(await ethers.provider.getBalance(nftAddress)).to.equal(ethers.parseEther('0.7'))
  })

  it('charges launchpad platform mint fee only through LaunchpadMinter', async function () {
    const [owner, treasury, buyer] = await ethers.getSigners()
    const MockHolderNFT = await ethers.getContractFactory('MockHolderNFT')
    const electroGems = await waitDeployed(await MockHolderNFT.deploy())
    const clubWatch = await waitDeployed(await MockHolderNFT.deploy())

    const LaunchpadMinter = await ethers.getContractFactory('LaunchpadMinter')
    const launchpadMinter = await waitDeployed(
      await LaunchpadMinter.deploy(300, treasury.address, await electroGems.getAddress(), await clubWatch.getAddress()),
    )

    const { nft } = await deployNft(
      { mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 },
      owner,
      {
        treasury: treasury.address,
        platformMintFeeBps: 300,
        electroGems: await electroGems.getAddress(),
        clubWatch: await clubWatch.getAddress(),
      },
    )

    await nft.connect(owner).setBaseURI('ipfs://collection/')
    await nft.connect(owner).setMintPrice(ethers.parseEther('100'))
    await nft.connect(owner).setMintable(true)

    expect(await nft.requiredMintPayment(buyer.address, 1)).to.equal(ethers.parseEther('100'))
    expect(await launchpadMinter.requiredMintPayment(await nft.getAddress(), buyer.address, 1)).to.equal(
      ethers.parseEther('103'),
    )

    const treasuryBefore = await ethers.provider.getBalance(treasury.address)
    await launchpadMinter.connect(buyer).mintERC721(await nft.getAddress(), 1, { value: ethers.parseEther('103') })
    const treasuryAfter = await ethers.provider.getBalance(treasury.address)
    expect(treasuryAfter - treasuryBefore).to.equal(ethers.parseEther('3'))
    expect(await nft.ownerOf(1)).to.equal(buyer.address)
  })

  it('waives launchpad platform mint fee when buyer holds both ElectroGem and Club Watch', async function () {
    const [owner, treasury, buyer] = await ethers.getSigners()
    const MockHolderNFT = await ethers.getContractFactory('MockHolderNFT')
    const electroGems = await waitDeployed(await MockHolderNFT.deploy())
    const clubWatch = await waitDeployed(await MockHolderNFT.deploy())

    const LaunchpadMinter = await ethers.getContractFactory('LaunchpadMinter')
    const launchpadMinter = await waitDeployed(
      await LaunchpadMinter.deploy(300, treasury.address, await electroGems.getAddress(), await clubWatch.getAddress()),
    )

    const { nft } = await deployNft(
      { mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 },
      owner,
      {
        treasury: treasury.address,
        platformMintFeeBps: 300,
        electroGems: await electroGems.getAddress(),
        clubWatch: await clubWatch.getAddress(),
      },
    )

    await nft.connect(owner).setBaseURI('ipfs://collection/')
    await nft.connect(owner).setMintPrice(ethers.parseEther('100'))
    await nft.connect(owner).setMintable(true)
    await electroGems.mint(buyer.address, 1)
    await clubWatch.mint(buyer.address, 1)

    expect(await launchpadMinter.requiredMintPayment(await nft.getAddress(), buyer.address, 1)).to.equal(
      ethers.parseEther('100'),
    )

    const treasuryBefore = await ethers.provider.getBalance(treasury.address)
    await launchpadMinter.connect(buyer).mintERC721(await nft.getAddress(), 1, { value: ethers.parseEther('100') })
    const treasuryAfter = await ethers.provider.getBalance(treasury.address)
    expect(treasuryAfter - treasuryBefore).to.equal(0n)
    expect(await nft.ownerOf(1)).to.equal(buyer.address)
  })

  it('charges launchpad platform mint fee when buyer holds only one holder NFT', async function () {
    const [owner, treasury, buyer] = await ethers.getSigners()
    const MockHolderNFT = await ethers.getContractFactory('MockHolderNFT')
    const electroGems = await waitDeployed(await MockHolderNFT.deploy())
    const clubWatch = await waitDeployed(await MockHolderNFT.deploy())

    const LaunchpadMinter = await ethers.getContractFactory('LaunchpadMinter')
    const launchpadMinter = await waitDeployed(
      await LaunchpadMinter.deploy(300, treasury.address, await electroGems.getAddress(), await clubWatch.getAddress()),
    )

    const { nft } = await deployNft(
      { mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 },
      owner,
      {
        treasury: treasury.address,
        platformMintFeeBps: 300,
        electroGems: await electroGems.getAddress(),
        clubWatch: await clubWatch.getAddress(),
      },
    )

    await nft.connect(owner).setBaseURI('ipfs://collection/')
    await nft.connect(owner).setMintPrice(ethers.parseEther('100'))
    await nft.connect(owner).setMintable(true)
    await electroGems.mint(buyer.address, 1)

    expect(await launchpadMinter.requiredMintPayment(await nft.getAddress(), buyer.address, 1)).to.equal(
      ethers.parseEther('103'),
    )
  })

  it('accepts marketplace mint payment at mint price only', async function () {
    const ES_MINTER_V3 = '0x41B8c31e35317124a7a4895ea034538C213c060f'
    const [owner] = await ethers.getSigners()
    const { nft } = await deployNft({ mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }, owner)

    await nft.connect(owner).setBaseURI('ipfs://collection/')
    await nft.connect(owner).setMintPrice(ethers.parseEther('100'))
    await nft.connect(owner).setMintable(true)

    expect(await nft.requiredMintPayment(ES_MINTER_V3, 1)).to.equal(ethers.parseEther('100'))

    await ethers.provider.send('hardhat_impersonateAccount', [ES_MINTER_V3])
    await owner.sendTransaction({ to: ES_MINTER_V3, value: ethers.parseEther('110') })
    const esMinter = await ethers.getSigner(ES_MINTER_V3)

    await nft.connect(esMinter).mint(1, { value: ethers.parseEther('100') })
    expect(await nft.ownerOf(1)).to.equal(ES_MINTER_V3)

    await ethers.provider.send('hardhat_stopImpersonatingAccount', [ES_MINTER_V3])
  })

  it('burns CLUB from paid IMintable mint via ETN swap', async function () {
    const [owner, minter] = await ethers.getSigners()
    const { nft, club } = await deployNft(
      { mintBurnBps: 1000n, burnOnMint: true, royaltyBurnBps: 0 },
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

  it('refunds marketplace overpayment and burns based on mint price only', async function () {
    const [owner, marketplace] = await ethers.getSigners()
    const { nft } = await deployNft({ mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }, owner)

    await nft.connect(owner).setBaseURI('ipfs://collection/')
    await nft.connect(owner).setMintPrice(ethers.parseEther('100'))
    await nft.connect(owner).setMintable(true)

    const marketplaceBefore = await ethers.provider.getBalance(marketplace.address)

    const tx = await nft.connect(marketplace).mint(1, { value: ethers.parseEther('103') })
    const receipt = await tx.wait()

    expect(await nft.ownerOf(1)).to.equal(marketplace.address)
    expect(await ethers.provider.getBalance(nft.target)).to.equal(ethers.parseEther('100'))

    const marketplaceAfter = await ethers.provider.getBalance(marketplace.address)
    const gasPaid = receipt.gasUsed * receipt.gasPrice
    expect(marketplaceBefore - marketplaceAfter).to.equal(ethers.parseEther('100') + gasPaid)
  })

  it('reverts IMintable mint when payment is below mint price', async function () {
    const [owner, minter] = await ethers.getSigners()
    const { nft } = await deployNft({ mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }, owner)

    await nft.connect(owner).setBaseURI('ipfs://collection/')
    await nft.connect(owner).setMintPrice(ethers.parseEther('100'))
    await nft.connect(owner).setMintable(true)

    await expect(nft.connect(minter).mint(1, { value: ethers.parseEther('99') })).to.be.revertedWith(
      'Insufficient payment',
    )
  })

  it('exposes IMintable marketplace helpers', async function () {
    const [owner, buyer] = await ethers.getSigners()
    const { nft } = await deployNft({ mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }, owner)

    await nft.connect(owner).setBaseURI('ipfs://collection/')
    await nft.connect(owner).setMintPrice(ethers.parseEther('5'))
    await nft.connect(owner).setMintable(true)
    await nft.connect(owner).setMaxMintPerWallet(2)

    expect(await nft.mintPrice()).to.equal(ethers.parseEther('5'))
    expect(await nft.mintableCount(buyer.address)).to.equal(2n)
  })

  it('assigns random metadata when random public mint is enabled', async function () {
    const [owner, minter] = await ethers.getSigners()
    const { nft } = await deployNft({ mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }, owner)

    await nft.connect(owner).setBaseURI('ipfs://collection/')
    await nft.connect(owner).setMintPrice(ethers.parseEther('5'))
    await nft.connect(owner).setRandomPublicMint(true)
    await nft.connect(owner).setMintable(true)

    expect(await nft.tokenURI(1)).to.equal('ipfs://collection/1.json')
    expect(await nft.tokenURI(2)).to.equal('ipfs://collection/1.json')

    await nft.connect(minter).mint(1, { value: ethers.parseEther('5') })
    const uri = await nft.tokenURI(1)
    expect(uri).to.match(/^ipfs:\/\/collection\/\d+\.json$/)

    expect(await nft.tokenURI(2)).to.equal('ipfs://collection/1.json')
  })

  it('returns preview tokenURI for sequential public mint only', async function () {
    const [owner] = await ethers.getSigners()
    const { nft } = await deployNft({ mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }, owner)

    await nft.connect(owner).setBaseURI('ipfs://collection/')
    await nft.connect(owner).setMintPrice(ethers.parseEther('5'))
    await nft.connect(owner).setMintable(true)

    expect(await nft.tokenURI(1)).to.equal('ipfs://collection/1.json')
    expect(await nft.tokenURI(2)).to.equal('ipfs://collection/2.json')
    await expect(nft.tokenURI(11)).to.be.reverted
  })

  it('reverts tokenURI for unminted tokens when public mint is disabled', async function () {
    const [owner] = await ethers.getSigners()
    const { nft } = await deployNft({ mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }, owner)

    await expect(nft.tokenURI(1)).to.be.reverted
  })

  it('exposes ElectroSwap marketplace compatibility getters', async function () {
    const [owner, buyer] = await ethers.getSigners()
    const { nft } = await deployNft({ mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 }, owner)

    await nft.connect(owner).setMintPrice(ethers.parseEther('5'))
    await nft.connect(owner).setMaxMintPerWallet(2)

    expect(await nft.totalSupply()).to.equal(0n)
    expect(await nft.totalMinted()).to.equal(0n)
    expect(await nft.feeReceiver()).to.equal(owner.address)
    expect(await nft.MAX_SUPPLY()).to.equal(10n)
    expect(await nft.MAX_MINT_PER_WALLET()).to.equal(2n)
    expect(await nft.PRICE()).to.equal(ethers.parseEther('5'))

    await nft.connect(owner).setBaseURI('ipfs://collection/')
    await nft.connect(owner).setMintable(true)
    await nft.connect(buyer).mint(1, { value: ethers.parseEther('5') })

    expect(await nft.totalSupply()).to.equal(1n)
    expect(await nft.totalMinted()).to.equal(1n)
  })
})

describe('EditableERC721V2 ElectroSwap mint gas', function () {
  const ES_MINTER_V3 = '0x41B8c31e35317124a7a4895ea034538C213c060f'
  // Failed ElectroSwap qty-2 txs exhausted ~460k gas on mainnet; hardhat runs ~1.45x cheaper.
  const MAINNET_ES_GAS_CEILING = {
    1: 340_000n,
    2: 460_000n,
    3: 620_000n,
    4: 780_000n,
    5: 940_000n,
  }
  const HARDHAT_TO_MAINNET_NUM = 145n
  const HARDHAT_TO_MAINNET_DEN = 100n

  function hardhatGasCeiling(mainnetCeiling) {
    return (mainnetCeiling * HARDHAT_TO_MAINNET_DEN) / HARDHAT_TO_MAINNET_NUM
  }

  async function installEsMinterRuntime() {
    const MockEsMinter = await ethers.getContractFactory('MockEsMinter')
    const mock = await waitDeployed(await MockEsMinter.deploy())
    const code = await ethers.provider.getCode(await mock.getAddress())
    await ethers.provider.send('hardhat_setCode', [ES_MINTER_V3, code])
  }

  async function deployV2Nft(owner, { maxSupply = 10, randomPublicMint = true } = {}) {
    const { wetn, club, router } = await deploySwapMocks()
    const NFT = await ethers.getContractFactory('EditableERC721V2')
    const nft = await waitDeployed(
      await NFT.deploy(
        'EditableV2',
        'ED2',
        owner.address,
        await club.getAddress(),
        await wetn.getAddress(),
        await router.getAddress(),
        { mintBurnBps: 0n, burnOnMint: false, royaltyBurnBps: 0 },
        maxSupply,
        500,
        owner.address,
        300,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
      ),
    )
    await nft.connect(owner).setBaseURI('ipfs://collection/')
    await nft.connect(owner).setMintPrice(ethers.parseEther('1'))
    if (randomPublicMint) {
      await nft.connect(owner).setRandomPublicMint(true)
    }
    await nft.connect(owner).setMintable(true)
    await nft.connect(owner).ownerMint(owner.address, '1.json')
    return nft
  }

  async function measureEsMinterPath(nft, owner, buyer, qty) {
    await installEsMinterRuntime()
    await ethers.provider.send('hardhat_impersonateAccount', [ES_MINTER_V3])
    await owner.sendTransaction({ to: ES_MINTER_V3, value: ethers.parseEther('100') })
    const esMinter = await ethers.getSigner(ES_MINTER_V3)
    const esContract = await ethers.getContractAt('MockEsMinter', ES_MINTER_V3, esMinter)

    const base = ethers.parseEther('1') * BigInt(qty)
    const buyerAddress = await buyer.getAddress()
    const tx = await esContract.mint(await nft.getAddress(), qty, buyerAddress, {
      value: base,
      gasLimit: 5_000_000n,
    })
    const receipt = await tx.wait()

    await ethers.provider.send('hardhat_stopImpersonatingAccount', [ES_MINTER_V3])
    return receipt.gasUsed
  }

  for (const qty of [1, 2, 3, 4, 5]) {
    it(`supports random public mint qty ${qty} through EsMinterV3 within ElectroSwap gas budget`, async function () {
      const [owner, buyer] = await ethers.getSigners()
      const nft = await deployV2Nft(owner)
      const gasUsed = await measureEsMinterPath(nft, owner, buyer, qty)
      const ceiling = hardhatGasCeiling(MAINNET_ES_GAS_CEILING[qty])

      expect(gasUsed).to.be.lte(ceiling)
      expect(await nft.totalSupply()).to.equal(BigInt(qty) + 1n)
      for (let tokenId = 2n; tokenId <= BigInt(qty) + 1n; tokenId++) {
        expect(await nft.ownerOf(tokenId)).to.equal(await buyer.getAddress())
        expect(await nft.tokenURI(tokenId)).to.match(/^ipfs:\/\/collection\/\d+\.json$/)
      }
    })
  }
})
