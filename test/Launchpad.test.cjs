const { expect } = require('chai')
const { ethers } = require('hardhat')

const CLUB_TOKEN = '0xC9FC4AB00911793D99b5c7Bd01f01203C21D4131'

describe('LaunchpadFactory', function () {
  it('deploys a collection when publish fee is paid', async function () {
    const [owner, creator] = await ethers.getSigners()
    const Factory = await ethers.getContractFactory('LaunchpadFactory')
    const publishFee = ethers.parseEther('1')
    const factory = await Factory.deploy(owner.address, owner.address, CLUB_TOKEN, publishFee)
    await factory.waitForDeployment()

    const burnConfig = {
      clubBurnAmount: 0n,
      burnOnMint: false,
      burnOnResale: false,
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
    const Factory = await ethers.getContractFactory('LaunchpadFactory')
    const publishFee = ethers.parseEther('1')
    const factory = await Factory.deploy(owner.address, owner.address, CLUB_TOKEN, publishFee)
    await factory.waitForDeployment()

    const burnConfig = { clubBurnAmount: 0n, burnOnMint: false, burnOnResale: false }
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
  it('mints with URI and allows owner to update metadata', async function () {
    const [owner, minter] = await ethers.getSigners()
    const burnConfig = {
      clubBurnAmount: 0n,
      burnOnMint: false,
      burnOnResale: false,
    }

    const NFT = await ethers.getContractFactory('EditableERC721')
    const nft = await NFT.deploy('Editable', 'EDT', owner.address, CLUB_TOKEN, burnConfig, 10)
    await nft.waitForDeployment()

    await nft.connect(owner).mint(minter.address, 'ipfs://initial')
    expect(await nft.tokenURI(1)).to.equal('ipfs://initial')

    await nft.connect(owner).setTokenURI(1, 'ipfs://updated')
    expect(await nft.tokenURI(1)).to.equal('ipfs://updated')
  })

  it('allows owner to withdraw ETN from the contract', async function () {
    const [owner] = await ethers.getSigners()
    const burnConfig = { clubBurnAmount: 0n, burnOnMint: false, burnOnResale: false }

    const NFT = await ethers.getContractFactory('EditableERC721')
    const nft = await NFT.deploy('Editable', 'EDT', owner.address, CLUB_TOKEN, burnConfig, 10)
    await nft.waitForDeployment()

    const amount = ethers.parseEther('1')
    await owner.sendTransaction({ to: await nft.getAddress(), value: amount })

    const before = await ethers.provider.getBalance(owner.address)
    await nft.connect(owner).withdraw()
    const after = await ethers.provider.getBalance(owner.address)

    expect(after).to.be.gt(before)
  })
})
