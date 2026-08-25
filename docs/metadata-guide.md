# Metadata & artwork guide for creators

This launchpad stores NFT images and JSON metadata in a format compatible with OpenSea, wallets, and IMintable marketplaces. **You upload artwork; we build the metadata JSON for you** — you do not need to host images or write image URLs yourself.

## Quick checklist

- [ ] **Square images** (recommended 512×512 to 2048×2048 px)
- [ ] **PNG, JPEG, WebP, or GIF** — max **10 MB** each
- [ ] **Unique token name** per row (max 80 characters)
- [ ] **Optional description** per token (max 2000 characters)
- [ ] **One image file per token** in the Artwork step (or paired `1.png` + optional `1.json` in bulk import)
- [ ] **No royalty fields** in imported JSON (`fee_recipient`, `seller_fee_basis_points`, etc.)

Download reference templates from the live app or repo:

- [token-metadata.template.json](../public/templates/token-metadata.template.json)
- [example-token-1.json](../public/templates/example-token-1.json)

---

## What you provide vs what we generate

| You provide | We generate |
|-------------|-------------|
| Image file per token | Public image URL in Supabase Storage |
| Name, description, attributes (in the wizard or optional bulk JSON) | Full metadata JSON per token |
| Collection settings (mint mode, burns, royalties) | On-chain `tokenURI` / base URI at publish |

You **never** type an image URL in the create wizard. After you save, each token’s JSON includes a public `image` URL pointing at the file you uploaded.

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
4. **Bulk import:** name files `1.png`, `2.png`, … (optional matching `1.json` for name/description/attributes only).
5. **Keep file sizes reasonable** — large GIFs may hit the 10 MB limit.

---

## Metadata JSON schema

Each token gets one JSON file when you save or publish. The create wizard **Preview** step shows the shape below. The `image` value is a placeholder until save; we replace it with the real public URL automatically.

```json
{
  "name": "Token name",
  "description": "Optional description",
  "image": "(we generate this from your uploaded image)",
  "attributes": []
}
```

| Field | Required | Limits | Notes |
|-------|----------|--------|-------|
| `name` | Yes | 80 chars | You enter this in Artwork (or in bulk `N.json`) |
| `description` | No | 2000 chars | Optional; empty string if omitted |
| `image` | Yes (in final JSON) | — | **Do not supply a URL yourself** — we set this from your uploaded image when you save |
| `attributes` | No | Array | Add traits in the wizard or in bulk `N.json` |

### Bulk import JSON (`1.json`, `2.json`, …)

Optional JSON files only need **name**, **description**, and **attributes**. Pair each JSON with a matching image (`1.json` + `1.png`). Any `image` field inside imported JSON is **ignored** — the paired image file is always used.

### Forbidden fields (never include in imported JSON)

Royalties are **on-chain only** (EIP-2981). Do not put these in JSON:

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

Example **generated** `image` value after save:

```
https://YOUR-PROJECT.supabase.co/storage/v1/object/public/collection-images/{collectionId}/1.png
```

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
| **Public mint (IMintable)** | **All max supply** rows complete — collectors mint via any marketplace that supports IMintable |

A row is **complete** when it has a **name** and an **image file**.

---

## Public mint and base URI

If public mint is enabled, the contract uses a **base URI** pointing at your metadata folder. Token `#1` resolves to `{baseURI}1.json`, token `#2` to `{baseURI}2.json`, and so on.

---

## Editing after publish

Use **Edit** on your dashboard to change names, descriptions, attributes, or artwork for tokens you have not minted yet. Saving re-uploads images and regenerates metadata JSON with updated public URLs, then syncs on-chain when needed.

There is no separate “edit metadata URL” screen — artwork and traits are edited in the collection editor; URLs are always generated for you.

---

## Recommended workflow

1. Prepare **square** artwork files locally (consistent size).
2. In **Artwork**, add one row per token: upload the image and enter name (and optional description/traits).
3. Use **Preview** to check the generated JSON for each token (image will show as a placeholder until save).
4. Save draft → publish from dashboard.
5. Mint from dashboard (lazy/batch) or enable public mint for collectors.

For large collections, use bulk import with numbered `1.png` / `1.json` pairs, or prepare names/descriptions in optional JSON files alongside your images.
