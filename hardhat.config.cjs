require('@nomicfoundation/hardhat-ethers')
require('@nomicfoundation/hardhat-chai-matchers')
require('@nomicfoundation/hardhat-verify')
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/)
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim()
    }
  }
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      evmVersion: 'paris',
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    electroneum: {
      url: process.env.ELECTRONEUM_MAINNET_RPC ?? 'https://rpc.ankr.com/electroneum',
      chainId: 52014,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    electroneumTestnet: {
      url: 'https://rpc.ankr.com/electroneum_testnet',
      chainId: 5201420,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      electroneum: process.env.BLOCKSCOUT_API_KEY ?? 'blockscout',
      electroneumTestnet: process.env.BLOCKSCOUT_API_KEY ?? 'blockscout',
    },
    customChains: [
      {
        network: 'electroneum',
        chainId: 52014,
        urls: {
          apiURL: 'https://blockexplorer.electroneum.com/api',
          browserURL: 'https://blockexplorer.electroneum.com',
        },
      },
      {
        network: 'electroneumTestnet',
        chainId: 5201420,
        urls: {
          apiURL: 'https://testnet-blockexplorer.electroneum.com/api',
          browserURL: 'https://testnet-blockexplorer.electroneum.com',
        },
      },
    ],
  },
}
