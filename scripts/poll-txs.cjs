const { ethers } = require('hardhat')

async function main() {
  const txs = process.argv.slice(2).length
    ? process.argv.slice(2)
    : (process.env.POLL_TXS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (txs.length === 0) {
    console.error('Usage: hardhat run scripts/poll-txs.cjs --network <net> -- <txHash>...')
    process.exit(1)
  }
  const bal = await ethers.provider.getBalance('0x126aa663BdeDd6Ae477fd28a7d0b624b8109D15d')
  console.log('balance', ethers.formatEther(bal), 'ETN')
  for (const tx of txs) {
    const receipt = await ethers.provider.getTransactionReceipt(tx)
    console.log(tx, receipt ? { status: receipt.status, contract: receipt.contractAddress } : 'pending')
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
