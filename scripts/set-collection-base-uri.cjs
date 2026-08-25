const { ethers } = require('ethers')
const fs = require('fs')
const path = require('path')

const NFT_ABI = ['function setBaseURI(string calldata baseURI_) external', 'function owner() view returns (address)']

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  }
}

async function main() {
  loadEnvFile()

  const contractAddress = process.argv[2]
  const baseUri = process.argv[3]
  const rpcUrl = process.argv[4] || process.env.ELECTRONEUM_MAINNET_RPC || 'https://rpc.electroneum.com'
  const privateKey = process.env.COLLECTION_OWNER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY

  if (!contractAddress || !baseUri) {
    console.error('Usage: node scripts/set-collection-base-uri.cjs <contract> <baseUri> [rpcUrl]')
    process.exit(1)
  }
  if (!privateKey) {
    console.error('Missing COLLECTION_OWNER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in .env')
    process.exit(1)
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)
  const contract = new ethers.Contract(contractAddress, NFT_ABI, wallet)

  const owner = await contract.owner()
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error(`Wallet ${wallet.address} is not contract owner (${owner})`)
    process.exit(1)
  }

  console.log(`Setting baseURI on ${contractAddress}...`)
  const tx = await contract.setBaseURI(baseUri)
  console.log('tx:', tx.hash)
  await tx.wait()
  console.log('baseURI updated to', baseUri)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
