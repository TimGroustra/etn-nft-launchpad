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

async function mintPaidAndGetTokenId(gemShards, signer, value = ethers.parseEther('10000')) {
  const tx = await gemShards.connect(signer).mintPaid({ value })
  const receipt = await tx.wait()
  const minted = receipt.logs
    .map((log) => {
      try {
        return gemShards.interface.parseLog(log)
      } catch {
        return null
      }
    })
    .find((parsed) => parsed?.name === 'ShardMinted')
  if (!minted) throw new Error('ShardMinted event missing')
  return minted.args.tokenId
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

    const holderTokenId = await mintPaidAndGetTokenId(gemShards, holder)
    await mintPaidAndGetTokenId(gemShards, buyer)

    await buyer.sendTransaction({
      to: await distributor.getAddress(),
      value: ethers.parseEther('10'),
    })

    const pendingBefore = await distributor.pendingReward(holderTokenId)
    expect(pendingBefore).to.be.gt(0n)

    await gemShards.connect(holder)['safeTransferFrom(address,address,uint256)'](
      holder.address,
      buyer.address,
      holderTokenId,
    )

    const pendingAfter = await distributor.pendingReward(holderTokenId)
    expect(pendingAfter).to.equal(0n)
    expect(await distributor.pendingReward(holderTokenId)).to.equal(0n)
  })

  it('allows shard owners to claim accrued rewards', async function () {
    const { holder, distributor, gemShards } = await deployGemShardsStack()

    const tokenId = await mintPaidAndGetTokenId(gemShards, holder)

    await holder.sendTransaction({
      to: await distributor.getAddress(),
      value: ethers.parseEther('4'),
    })

    const pending = await distributor.pendingReward(tokenId)
    expect(pending).to.equal(ethers.parseEther('2'))

    const balanceBefore = await ethers.provider.getBalance(holder.address)
    const tx = await distributor.connect(holder).claim(tokenId)
    const receipt = await tx.wait()
    const gas = receipt.gasUsed * receipt.gasPrice
    const balanceAfter = await ethers.provider.getBalance(holder.address)

    expect(balanceAfter + gas - balanceBefore).to.equal(ethers.parseEther('2'))
    expect(await distributor.pendingReward(tokenId)).to.equal(0n)
  })

  it('assigns primal token ids double share weight', async function () {
    const { distributor } = await deployGemShardsStack()
    expect(await distributor.shardWeight(1n)).to.equal(1n)
    expect(await distributor.shardWeight(491n)).to.equal(2n)
  })

  it('mints a free shard for electro gem holders once per token id', async function () {
    const { holder, gemShards } = await deployGemShardsStack()

    const tx = await gemShards.connect(holder).mintFree(1n)
    const receipt = await tx.wait()
    const minted = receipt.logs
      .map((log) => {
        try {
          return gemShards.interface.parseLog(log)
        } catch {
          return null
        }
      })
      .find((parsed) => parsed?.name === 'ShardMinted')
    const tokenId = minted.args.tokenId

    await expect(gemShards.connect(holder).mintFree(1n)).to.be.revertedWith('Free mint claimed')
    expect(await gemShards.ownerOf(tokenId)).to.equal(holder.address)
  })

  it('emits ERC-4906 metadata updates when rewards change', async function () {
    const { holder, distributor, gemShards } = await deployGemShardsStack()

    const tokenId = await mintPaidAndGetTokenId(gemShards, holder)

    await expect(
      holder.sendTransaction({
        to: await distributor.getAddress(),
        value: ethers.parseEther('1'),
      }),
    ).to.emit(gemShards, 'BatchMetadataUpdate')

    await expect(distributor.connect(holder).claim(tokenId)).to.emit(gemShards, 'MetadataUpdate')
  })

  it('charges dual holders 50% on paid mint', async function () {
    const { owner, dualHolder, electroGem, clubWatch, gemShards } = await deployGemShardsStack()

    await electroGem.connect(owner).mint(dualHolder.address)
    await clubWatch.mint(dualHolder.address, 1n)

    expect(await gemShards.requiredPaidMintPrice(dualHolder.address)).to.equal(ethers.parseEther('5000'))

    await expect(gemShards.connect(dualHolder).mintPaid({ value: ethers.parseEther('5000') })).to.emit(
      gemShards,
      'ShardMinted',
    )
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

    await expect(gemShards.connect(buyer).mintPaid({ value: ethers.parseEther('10000') })).to.emit(
      gemShards,
      'ShardMinted',
    )
  })

  it('rejects mints while minting is disabled', async function () {
    const { owner, holder, electroGem, gemShards } = await deployGemShardsStack()

    await gemShards.connect(owner).setMintingEnabled(false)
    await electroGem.connect(owner).mintTo(holder.address, 50n)

    await expect(
      gemShards.connect(holder).mintPaid({ value: ethers.parseEther('10000') }),
    ).to.be.revertedWith('Minting not enabled')
  })

  it('mints random token ids instead of sequential order', async function () {
    const { holder, buyer, gemShards } = await deployGemShardsStack()

    const first = await mintPaidAndGetTokenId(gemShards, holder)
    const second = await mintPaidAndGetTokenId(gemShards, buyer)

    expect(first).to.not.equal(second)
    expect(await gemShards.totalMinted()).to.equal(2n)
    expect(await gemShards.remainingSupply()).to.equal(493n)
  })

  it('keeps paid mint revenue in the contract for owner withdraw', async function () {
    const { owner, holder, gemShards } = await deployGemShardsStack()

    await mintPaidAndGetTokenId(gemShards, holder)

    const contractBalance = await ethers.provider.getBalance(await gemShards.getAddress())
    expect(contractBalance).to.equal(ethers.parseEther('10000'))

    const ownerBalanceBefore = await ethers.provider.getBalance(owner.address)
    const tx = await gemShards.connect(owner).withdraw()
    const receipt = await tx.wait()
    const gas = receipt.gasUsed * receipt.gasPrice
    const ownerBalanceAfter = await ethers.provider.getBalance(owner.address)

    expect(ownerBalanceAfter + gas - ownerBalanceBefore).to.equal(ethers.parseEther('10000'))
    expect(await ethers.provider.getBalance(await gemShards.getAddress())).to.equal(0n)
  })

  it('allows owner mint without payment', async function () {
    const { owner, gemShards } = await deployGemShardsStack()

    const tx = await gemShards.connect(owner).ownerMint(owner.address)
    const receipt = await tx.wait()
    const minted = receipt.logs
      .map((log) => {
        try {
          return gemShards.interface.parseLog(log)
        } catch {
          return null
        }
      })
      .find((parsed) => parsed?.name === 'ShardMinted')

    expect(minted).to.not.equal(undefined)
    expect(await gemShards.ownerOf(minted.args.tokenId)).to.equal(owner.address)
  })
})
