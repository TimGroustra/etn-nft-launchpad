import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createPublicClient,
  encodeAbiParameters,
  http,
  parseAbi,
  parseAbiParameters,
} from 'viem'
import { buildNamedVerificationBundle } from './solidity-contract-name.mjs'

const contractAddress = process.argv[2] ?? '0x6cfca135318bf4c9f03c7b80097701ba3014b7ff'
const api = 'https://blockexplorer.electroneum.com/api'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseBundle = JSON.parse(
  fs.readFileSync(path.join(root, 'public', 'editable-erc721-verification.json'), 'utf8'),
)

const COLLECTION_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function owner() view returns (address)',
  'function clubToken() view returns (address)',
  'function WETN() view returns (address)',
  'function swapRouter() view returns (address)',
  'function burnConfig() view returns (uint96 mintBurnBps, bool burnOnMint, uint96 royaltyBurnBps)',
  'function maxSupply() view returns (uint256)',
])

const FACTORY_ABI = parseAbi(['function defaultRoyaltyBps() view returns (uint96)'])
const factoryAddress = '0x85ceB5f1D66c1B5e7661B4cABfB4ecCF5d80673a'

const client = createPublicClient({
  transport: http('https://rpc.ankr.com/electroneum'),
})

const [name, symbol, owner, clubToken, wetn, swapRouter, burnConfig, maxSupply, defaultRoyaltyBps] =
  await Promise.all([
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'name' }),
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'symbol' }),
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'owner' }),
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'clubToken' }),
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'WETN' }),
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'swapRouter' }),
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'burnConfig' }),
    client.readContract({ address: contractAddress, abi: COLLECTION_ABI, functionName: 'maxSupply' }),
    client.readContract({
      address: factoryAddress,
      abi: FACTORY_ABI,
      functionName: 'defaultRoyaltyBps',
    }),
  ])

const encoded = encodeAbiParameters(
  parseAbiParameters(
    'string, string, address, address, address, address, (uint96 mintBurnBps, bool burnOnMint, uint96 royaltyBurnBps), uint256, uint96',
  ),
  [
    name,
    symbol,
    owner,
    clubToken,
    wetn,
    swapRouter,
    {
      mintBurnBps: burnConfig[0],
      burnOnMint: burnConfig[1],
      royaltyBurnBps: burnConfig[2],
    },
    maxSupply,
    defaultRoyaltyBps,
  ],
)

const constructorArguments = encoded.startsWith('0x') ? encoded.slice(2) : encoded
const bundle = buildNamedVerificationBundle(baseBundle, name)
console.log('Verifying as', bundle.contractName, '(from collection name:', name, ')')

const form = new URLSearchParams()
form.set('module', 'contract')
form.set('action', 'verifysourcecode')
form.set('contractaddress', contractAddress)
form.set('sourceCode', JSON.stringify(bundle.standardJsonInput))
form.set('codeformat', 'solidity-standard-json-input')
form.set('contractname', bundle.contractName)
form.set('compilerversion', bundle.compilerVersion)
form.set('optimizationUsed', '1')
form.set('runs', '200')
form.set('constructorArguments', constructorArguments)

const submitRes = await fetch(api, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: form.toString(),
})
const submit = await submitRes.json()
console.log('submit', submit)

if (submit.status !== '1') process.exit(1)

const guid = submit.result
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  const statusRes = await fetch(
    `${api}?module=contract&action=checkverifystatus&guid=${encodeURIComponent(guid)}`,
  )
  const status = await statusRes.json()
  console.log('status', status)
  const result = String(status.result ?? '')
  if (result.toLowerCase().includes('pass')) {
    console.log('VERIFIED')
    process.exit(0)
  }
  if (result.toLowerCase().includes('fail')) {
    console.log('FAILED')
    process.exit(1)
  }
}

console.log('TIMEOUT')
process.exit(1)
