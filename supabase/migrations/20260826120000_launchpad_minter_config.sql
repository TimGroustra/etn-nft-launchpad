-- Platform mint fee is collected by LaunchpadMinter on etn-nft-launchpad.club only.
-- Populate after deploying contracts/LaunchpadMinter.sol.
INSERT INTO platform_config (key, value)
VALUES
  ('launchpad_minter_mainnet', '0x0000000000000000000000000000000000000000'),
  ('launchpad_minter_testnet', '0x0000000000000000000000000000000000000000')
ON CONFLICT (key) DO NOTHING;
