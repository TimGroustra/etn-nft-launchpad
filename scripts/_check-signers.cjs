const hre = require('hardhat')

async function main() {
  const signers = await hre.ethers.getSigners()
  console.log('signers', signers.length)
  if (signers[0]) console.log('deployer', signers[0].address)
  console.log('has_key', Boolean(process.env.DEPLOYER_PRIVATE_KEY))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
