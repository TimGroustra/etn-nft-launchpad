export const DEFAULT_ROYALTY_BPS = 500

/** Keys users must not supply in imported JSON — the platform writes these on sync. */
export const USER_METADATA_ROYALTY_KEYS = [
  'seller_fee_basis_points',
  'fee_recipient',
  'royalty_info',
  'royalties',
  'primary_sale_recipient',
] as const

/** @deprecated use USER_METADATA_ROYALTY_KEYS */
export const FORBIDDEN_METADATA_ROYALTY_KEYS = USER_METADATA_ROYALTY_KEYS

export type NftAttribute = {
  trait_type: string
  value: string | number
}

export type NftMetadata = {
  name: string
  description: string
  image: string
  attributes: NftAttribute[]
  seller_fee_basis_points?: number
  fee_recipient?: string
}

export function buildNftMetadata(input: {
  name: string
  description?: string | null
  imageUrl: string
  attributes?: NftAttribute[]
  royaltyBps?: number
  feeRecipient?: string
}): NftMetadata {
  const metadata: NftMetadata = {
    name: input.name.trim(),
    description: (input.description ?? '').trim(),
    image: input.imageUrl,
    attributes: input.attributes ?? [],
  }

  const royaltyBps = input.royaltyBps ?? 0
  const feeRecipient = input.feeRecipient?.trim()
  if (royaltyBps > 0 && feeRecipient) {
    metadata.seller_fee_basis_points = Math.min(10_000, Math.max(0, Math.round(royaltyBps)))
    metadata.fee_recipient = feeRecipient.toLowerCase()
  }

  return metadata
}

export function buildDraftMetadataPreview(input: {
  name: string
  description?: string | null
  attributes?: NftAttribute[]
  royaltyBps?: number
  /** Shown in preview before the collection contract is deployed. */
  feeRecipientPreview?: string
}): NftMetadata {
  return buildNftMetadata({
    name: input.name,
    description: input.description,
    attributes: input.attributes,
    imageUrl: '(uploaded when you save — public URL generated automatically)',
    royaltyBps: input.royaltyBps,
    feeRecipient: input.feeRecipientPreview,
  })
}

export function sanitizeMetadataRecord(metadata: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...metadata }
  for (const key of USER_METADATA_ROYALTY_KEYS) {
    delete next[key]
  }
  return next
}

export function validateNoMetadataRoyaltyFields(metadata: Record<string, unknown>): string | null {
  for (const key of USER_METADATA_ROYALTY_KEYS) {
    if (key in metadata && metadata[key] != null && metadata[key] !== '') {
      return `Metadata must not include "${key}". Royalty fields are set automatically when you sync.`
    }
  }

  const attributes = metadata.attributes
  if (Array.isArray(attributes)) {
    for (const attr of attributes) {
      if (!attr || typeof attr !== 'object') continue
      const trait = String((attr as { trait_type?: unknown }).trait_type ?? '').toLowerCase()
      if (
        trait.includes('fee_recipient') ||
        trait.includes('royalty') ||
        trait.includes('seller_fee')
      ) {
        return 'Attributes cannot encode royalty wallet or fee settings.'
      }
    }
  }

  return null
}

export function formatRoyaltyPercent(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`
}

export function shortenAddress(address: string): string {
  if (address.length < 10) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
