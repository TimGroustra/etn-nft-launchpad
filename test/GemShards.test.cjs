const { expect } = require('chai')
const { ethers } = require('hardhat')
const { time } = require('@nomicfoundation/hardhat-network-helpers')

const TREASURY = '0x126aa663BdeDd6Ae477fd28a7d0b624b8109D15d'
const METADATA_BASE = 'https://example.com/gem-shard-metadata/'

async function waitDeployed(contract) {
  const tx = contract.deploymentTransaction()
  if (!tx) throw new Error('Missing deployment transaction')
  await tx.wait()
  return contract
}

async function deployGemShardsStack() {
  const [owner, holder, buyer, dualHolder, stranger] = await ethers.getSigners()

  for (const account of [holder, buyer, dualHolder, stranger]) {
    await ethers.provider.send('hardhat_setBalance', [
      account.address,
      ethers.toBeHex(ethers.parseEther('1000000')),
    ])
  }

  const MockElectroGem = await ethers.getContractFactory('MockElectroGem')
  const electroGem = await waitDeployed(await MockElectroGem.deploy(owner.address))

  const MockHolderNFT = await ethers.getContractFactory('MockHolderNFT')
  const clubWatch = await waitDeployed(await MockHolderNFT.deploy())

  const PublishFeeDistributor = await ethers.getContractFactory('PublishFeeDistributor')
  const distributor = await waitDeployed(
    await PublishFeeDistributor.deploy(owner.address, TREASURY),
  )

  const GemShards = await ethers.getContractFactory('GemShards')
  const gemShards = await waitDeployed(
    await GemShards.deploy(
      owner.address,
      owner.address,
      METADATA_BASE,
      await electroGem.getAddress(),
      await clubWatch.getAddress(),
    ),
  )

  await gemShards.setDistributor(await distributor.getAddress())
  await distributor.setGemShards(await gemShards.getAddress())
  await gemShards.setMintingEnabled(true)

  // Week-one gate requires ElectroGem for paid mints.
  await electroGem.connect(owner).mint(holder.address)
  await electroGem.connect(owner).mint(buyer.address)

  return { owner, holder, buyer, dualHolder, stranger, electroGem, clubWatch, distributor, gemShards }
}

describe('PublishFeeDistributor + GemShards', function () {
  it('splits incoming fees 50/50 between treasury and holder pool', async function () {
    const { owner, distributor } = await deployGemShardsStack()
    const treasuryBefore = await ethers.provider.getBalance(TREASURY)

    await owner.sendTransaction({
      to: await distributor.getAddress(),
      value: ethers.parseEther('10'),
    })

    const treasuryAfter = await ethers.provider.getBalance(TREASURY)
    // No shards minted yet, so the holder half is also routed to treasury.
    expect(treasuryAfter - treasuryBefore).to.equal(ethers.parseEther('10'))
    expect(await ethers.provider.getBalance(await distributor.getAddress())).to.equal(0n)
  })

  it('accrues weighted rewards and settles on transfer', async function () {
    const { holder, buyer, distributor, gemShards } = await deployGemShardsStack()

    await gemShards.connect(holder).mintPaid({ value: ethers.parseEther('10000') })
    await gemShards.connect(buyer).mintPaid({ value: ethers.parseEther('10000') })

    await buyer.sendTransaction({
      to: await distributor.getAddress(),
      value: ethers.parseEther('10'),
    })

    const pendingBefore = await distributor.pendingReward(1n)
    expect(pendingBefore).to.be.gt(0n)

    await gemShards.connect(holder)['safeTransferFrom(address,address,uint256)'](holder.address, buyer.address, 1n)

    const pendingAfter = await distributor.pendingReward(1n)
    expect(pendingAfter).to.equal(0n)
    expect(await distributor.pendingReward(2n)).to.be.gt(0n)
  })

  it('allows shard owners to claim accrued rewards', async function () {
    const { holder, distributor, gemShards } = await deployGemShardsStack()

    await gemShards.connect(holder).mintPaid({ value: ethers.parseEther('10000') })

    await holder.sendTransaction({
      to: await distributor.getAddress(),
      value: ethers.parseEther('4'),
    })

    const pending = await distributor.pendingReward(1n)
    expect(pending).to.equal(ethers.parseEther('2'))

    const balanceBefore = await ethers.provider.getBalance(holder.address)
    const tx = await distributor.connect(holder).claim(1n)
    const receipt = await tx.wait()
    const gas = receipt.gasUsed * receipt.gasPrice
    const balanceAfter = await ethers.provider.getBalance(holder.address)

    expect(balanceAfter + gas - balanceBefore).to.equal(ethers.parseEther('2'))
    expect(await distributor.pendingReward(1n)).to.equal(0n)
  })

  it('assigns primal token ids double share weight', async function () {
    const { distributor } = await deployGemShardsStack()
    expect(await distributor.shardWeight(1n)).to.equal(1n)
    expect(await distributor.shardWeight(491n)).to.equal(2n)
  })

  it('mints a free shard for electro gem holders once per token id', async function () {
    const { holder, gemShards } = await deployGemShardsStack()

    await expect(gemShards.connect(holder).mintFree(1n))
      .to.emit(gemShards, 'ShardMinted')
      .withArgs(1n, holder.address, true)

    await expect(gemShards.connect(holder).mintFree(1n)).to.be.revertedWith('Free mint claimed')
    expect(await gemShards.ownerOf(1n)).to.equal(holder.address)
  })

  it('emits ERC-4906 metadata updates when rewards change', async function () {
    const { holder, distributor, gemShards } = await deployGemShardsStack()

    await gemShards.connect(holder).mintPaid({ value: ethers.parseEther('10000') })

    await expect(
      holder.sendTransaction({
        to: await distributor.getAddress(),
        value: ethers.parseEther('1'),
      }),
    ).to.emit(gemShards, 'BatchMetadataUpdate')

    await expect(distributor.connect(holder).claim(1n)).to.emit(gemShards, 'MetadataUpdate')
  })

  it('charges dual holders 50% on paid mint', async function () {
    const { owner, dualHolder, electroGem, clubWatch, gemShards } = await deployGemShardsStack()

    await electroGem.connect(owner).mint(dualHolder.address)
    await clubWatch.mint(dualHolder.address, 1n)

    expect(await gemShards.requiredPaidMintPrice(dualHolder.address)).to.equal(ethers.parseEther('5000'))

    await expect(gemShards.connect(dualHolder).mintPaid({ value: ethers.parseEther('5000') }))
      .to.emit(gemShards, 'ShardMinted')
      .withArgs(1n, dualHolder.address, false)
  })

  it('rejects non-electrogem paid mint during week one', async function () {
    const { stranger, gemShards } = await deployGemShardsStack()

    await expect(
      gemShards.connect(stranger).mintPaid({ value: ethers.parseEther('10000') }),
    ).to.be.revertedWith('ElectroGem holders only')
  })

  it('allows public paid mint after week one', async function () {
    const { buyer, gemShards } = await deployGemShardsStack()

    await time.increase(7 * 24 * 60 * 60 + 1)

    await expect(gemShards.connect(buyer).mintPaid({ value: ethers.parseEther('10000') }))
      .to.emit(gemShards, 'ShardMinted')
      .withArgs(1n, buyer.address, false)
  })

  it('rejects mints while minting is disabled', async function () {
    const { owner, holder, electroGem, gemShards } = await deployGemShardsStack()

    await gemShards.connect(owner).setMintingEnabled(false)
    await electroGem.connect(owner).mintTo(holder.address, 50n)

    await expect(
      gemShards.connect(holder).mintPaid({ value: ethers.parseEther('10000') }),
    ).to.be.revertedWith('Minting not enabled')
  })
})
