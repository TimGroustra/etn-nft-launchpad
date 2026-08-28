/**
 * Link deployed GemShards contract to the platform collection row (draft).
 * Usage: node scripts/register-gem-shards-collection.cjs [mainnet|testnet]
 */
const fs = require('fs')
const path = require('path')

const network = process.argv[2] === 'testnet' ? 'testnet' : 'mainnet'
const chainId = network === 'mainnet' ? 52014 : 5201420
const configKey = network

const deploymentsPath = path.join(__dirname, '..', 'deployments.json')
const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))
const deploymentKey = network === 'mainnet' ? 'electroneum' : 'electroneumTestnet'
const gemShardsAddress = deployments[deploymentKey]?.GemShards

if (!gemShardsAddress) {
  console.error(`GemShards address missing in deployments.json for ${deploymentKey}`)
  process.exit(1)
}

console.log(`-- Register Gem Shards collection (${network}, chain ${chainId})`)
console.log(
  `UPDATE collections SET contract_address = '${gemShardsAddress.toLowerCase()}' WHERE symbol = 'GSHARD' AND chain_id = ${chainId};`,
)
console.log(
  `INSERT INTO platform_config (key, value) VALUES ('gem_shards_${configKey}', '${gemShardsAddress}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
)
console.log(
  `INSERT INTO platform_config (key, value) VALUES ('gem_shards_status_${configKey}', 'draft') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
)
