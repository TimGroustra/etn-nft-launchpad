# Metadata & artwork guide for creators

This launchpad stores NFT images and JSON metadata in a format compatible with OpenSea, wallets, and ElectroSwap. Follow these rules for the smoothest publish and mint experience.

## Quick checklist

- [ ] **Square images** (recommended 512×512 to 2048×2048 px)
- [ ] **PNG, JPEG, WebP, or GIF** — max **10 MB** each
- [ ] **Unique token name** per row (max 80 characters)
- [ ] **Optional description** per token (max 2000 characters)
- [ ] **One image per token row** in the Artwork step
- [ ] **No royalty fields** in JSON (`fee_recipient`, `seller_fee_basis_points`, etc.)

Download templates from the live app or repo:

- [token-metadata.template.json](../public/templates/token-metadata.template.json)
- [example-token-1.json](../public/templates/example-token-1.json)
- [ipfs-folder-structure.txt](../public/templates/ipfs-folder-structure.txt)

---

## Images

| Rule | Value |
|------|-------|
| Formats | PNG, JPEG, WebP, GIF |
| Min size | 256 × 256 px |
| Max size | 4096 × 4096 px |
| Max file size | 10 MB |
| Aspect ratio | **Square recommended** (1:1) for wallets and marketplaces |

### Tips

1. **Use consistent dimensions** across the collection (e.g. all 1024×1024).
2. **Prefer PNG or WebP** for sharp art; use JPEG for photos.
3. **Avoid tiny images** — upscaling after mint looks bad on marketplaces.
4. **Original filenames do not matter** — the platform assigns token IDs when you save (1, 2, 3…).
5. **Keep file sizes reasonable** — large GIFs may hit the 10 MB limit.

---

## Metadata JSON schema

Each token gets one JSON file. The platform generates this automatically when you use the create wizard; you only need to understand the schema if you host metadata yourself (IPFS, Arweave, etc.).

```json
{
  "name": "Token name",
  "description": "Optional description",
  "image": "https://full-url-to-image.png",
  "attributes": []
}
```

| Field | Required | Limits | Notes |
|-------|----------|--------|-------|
| `name` | Yes | 80 chars | Shown in wallets and marketplaces |
| `description` | No | 2000 chars | Empty string if omitted |
| `image` | Yes | Full URL | Must be publicly reachable (HTTPS or `ipfs://`) |
| `attributes` | No | Array | Trait list; wizard currently writes `[]` |

### Forbidden fields (never include)

Royalties are **on-chain only** (EIP-2981, fixed 5% at deploy). Do not put these in JSON:

- `seller_fee_basis_points`
- `fee_recipient`
- `royalty_info`
- `royalties`
- `primary_sale_recipient`

Also avoid attribute names containing `royalty`, `fee_recipient`, or `seller_fee`.

---

## How the platform stores files

After you save a draft, files are stored in Supabase:

| Asset | Path pattern |
|-------|----------------|
| Image | `{collectionId}/{tokenId}.png` |
| Metadata JSON | `{collectionId}/{tokenId}.json` |

Token IDs are **1-based** (first token is `#1`, not `#0`).

Example metadata URL after publish:

```
https://YOUR-PROJECT.supabase.co/storage/v1/object/public/collection-metadata/{collectionId}/1.json
```

---

## Mint mode vs how much artwork you need

| Mode | Artwork required |
|------|------------------|
| **Lazy mint** | At least **1** complete row (name + image). Add more before minting each token. |
| **Batch mint** | Exactly **max supply** complete rows (every token needs name + image). |
| **Public mint (ElectroSwap)** | **All max supply** rows complete — collectors mint unrevealed slots from the same metadata set. |

A row is **complete** when it has a **name** and an **image file**.

---

## Public mint and base URI

If public mint is enabled, the contract uses a **base URI** pointing at your metadata folder. Token `#1` resolves to `{baseURI}1.json`, token `#2` to `{baseURI}2.json`, and so on.

That is why filenames must follow `{tokenId}.json` when you host metadata yourself.

---

## Custom storage (IPFS / Arweave / your CDN)

By default the launchpad hosts everything in Supabase. After publish you can switch per token in **Edit metadata**:

1. Pin your images and JSON (you handle pinning/hosting).
2. Paste the full metadata URL (`ipfs://…` or `https://…`) in **Metadata / token URI**.
3. Click **Save & Sync On-Chain**.

Leave the URI **blank** to keep using auto-generated Supabase JSON.

See [ipfs-folder-structure.txt](../public/templates/ipfs-folder-structure.txt) for folder naming.

---

## Recommended workflow

1. Prepare **square** artwork files locally (consistent size).
2. In **Artwork**, fill one row per token with name + image.
3. Use **Preview** to check the generated JSON for each token.
4. Save draft → publish from dashboard.
5. Mint from dashboard (lazy/batch) or enable public mint for collectors.

For large collections, prepare a spreadsheet of token names/descriptions first, then upload images row by row in order.
