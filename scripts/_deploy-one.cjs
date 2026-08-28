const hre = require('hardhat')

async function main() {
  console.log('step1')
  const PublishFeeDistributor = await hre.ethers.getContractFactory('PublishFeeDistributor')
  console.log('step2 factory ok')
  const [deployer] = await hre.ethers.getSigners()
  console.log('step3 deployer', deployer.address)
  const tx = await PublishFeeDistributor.deploy(deployer.address, deployer.address)
  console.log('step4 deploy sent', tx.deploymentTransaction()?.hash)
  await tx.waitForDeployment()
  console.log('step5 deployed', await tx.getAddress())
}

main().catch((e) => {
  console.error('ERR', e)
  process.exitCode = 1
})
