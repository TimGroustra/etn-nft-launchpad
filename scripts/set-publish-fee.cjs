const { ethers } = require('ethers')

const FACTORY_TESTNET = '0xC760c0c8cA9D2fC6967488f4c4CB783D8b05BE0c'
const RPC_TESTNET = 'https://rpc.ankr.com/electroneum_testnet'

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY
  if (!privateKey) throw new Error('Set DEPLOYER_PRIVATE_KEY')

  const provider = new ethers.JsonRpcProvider(RPC_TESTNET)
  const wallet = new ethers.Wallet(privateKey, provider)
  const factory = new ethers.Contract(
    FACTORY_TESTNET,
    ['function publishFee() view returns (uint256)', 'function setPublishFee(uint256 newFee) external'],
    wallet,
  )

  const current = await factory.publishFee()
  const next = ethers.parseEther('1')
  console.log('Factory:', FACTORY_TESTNET)
  console.log('Owner wallet:', wallet.address)
  console.log('Current fee:', ethers.formatEther(current), 'ETN')
  console.log('Setting fee to:', ethers.formatEther(next), 'ETN')

  const tx = await factory.setPublishFee(next)
  console.log('Tx:', tx.hash)
  await tx.wait()
  console.log('Done. New fee:', ethers.formatEther(await factory.publishFee()), 'ETN')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
