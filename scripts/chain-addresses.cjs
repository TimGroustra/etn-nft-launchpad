/** On-chain addresses for Electroneum launchpad deployments. */
const CLUB_TOKEN = '0xC9FC4AB00911793D99b5c7Bd01f01203C21D4131'
const WETN_MAINNET = '0x138DAFbDA0CCB3d8E39C19edb0510Fc31b7C1c77'
/** ElectroSwap SwapRouter02 — V3 exactInput; NOT the V3 Liquidity Locker (0xfdB0…). */
const SWAP_ROUTER_V3_MAINNET = '0x5A3AB7e9f405250B36e7e0a4654c1052EADC1F07'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

module.exports = {
  CLUB_TOKEN,
  WETN_MAINNET,
  SWAP_ROUTER_V3_MAINNET,
  ZERO_ADDRESS,
  getDeploymentAddresses(chainId) {
    const isMainnet = chainId === 52014
    return {
      clubToken: CLUB_TOKEN,
      wetn: isMainnet ? WETN_MAINNET : ZERO_ADDRESS,
      swapRouter: isMainnet ? SWAP_ROUTER_V3_MAINNET : ZERO_ADDRESS,
    }
  },
}
