# ETN NFT Launchpad

Launch editable NFT collections on the Electroneum blockchain. Creators upload images and metadata to **Supabase Storage**, pay an ETN publish fee, deploy ERC-721 contracts with optional CLUB token burns, and keep metadata fully editable after launch.

## Storage model

- **Default:** Images and metadata JSON live in Supabase Storage (`collection-images`, `collection-metadata`).
- **Custom storage:** Creators can paste their own metadata URL (`ipfs://`, `https://`, etc.) in the editor and sync it on-chain via `setTokenURI`. The platform does not pin or host IPFS.

## Features

- Wallet connect (Reown AppKit + wagmi) on Electroneum mainnet and testnet
- Multi-step collection wizard with CLUB burn configuration
- Lazy and batch mint modes
- Post-publish metadata editor with EIP-4906 on-chain sync
- Publisher-owned contracts with ETN withdraw

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Factory contract addresses

Deploy factories, then register addresses in Supabase `platform_config` (or `.env`):

```bash
set DEPLOYER_PRIVATE_KEY=0x...
npm run deploy:testnet
npm run deploy:mainnet
```

After deploy, update `platform_config` in Supabase:

```sql
UPDATE platform_config SET value = '0xYourTestnetFactory' WHERE key = 'factory_address_testnet';
UPDATE platform_config SET value = '0xYourMainnetFactory' WHERE key = 'factory_address_mainnet';
```

Or set env vars: `VITE_FACTORY_ADDRESS_TESTNET`, `VITE_FACTORY_ADDRESS_MAINNET`.

## Editable factory (no redeploy for config changes)

`LaunchpadFactory` is **Ownable2Step**. The factory owner can update platform settings on-chain; only **new** collections pick up deployment config changes.

| Setting | Setter | Affects |
|---------|--------|---------|
| Publish fee | `setPublishFee` | Future publishes (app reads from chain) |
| Treasury | `setTreasury` | Where publish fees are sent |
| CLUB token | `setClubToken` | New collections only |
| WETN / swap router | `setWetn`, `setSwapRouter` | New collections only |
| Default EIP-2981 royalty | `setDefaultRoyaltyBps` | New collections only |

Update everything at once:

```bash
set DEPLOYER_PRIVATE_KEY=0x...
set FACTORY_PUBLISH_FEE_ETN=1
set FACTORY_WETN=0x...
set FACTORY_SWAP_ROUTER=0x...
set FACTORY_DEFAULT_ROYALTY_BPS=500
npm run factory:config
```

Or only publish fee:

```bash
npm run factory:publish-fee
```

Already-deployed collection contracts are unchanged (their swap addresses and royalty are fixed at their deploy time).

## Supabase Project

- **Project:** ETN-NFT-Launchpad (`sktexilttapijefdusni`)
- **URL:** https://sktexilttapijefdusni.supabase.co

Edge functions: `wallet-nonce`, `wallet-auth`, `collection-api`, `verify-publish-payment`, `sync-token-uri`
