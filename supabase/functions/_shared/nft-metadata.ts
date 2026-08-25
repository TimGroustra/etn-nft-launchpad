export const DEFAULT_ROYALTY_BPS = 500

export const USER_METADATA_ROYALTY_KEYS = [
  'seller_fee_basis_points',
  'fee_recipient',
  'royalty_info',
  'royalties',
  'primary_sale_recipient',
] as const

export const FORBIDDEN_METADATA_ROYALTY_KEYS = USER_METADATA_ROYALTY_KEYS

export type NftAttribute = {
  trait_type: string
  value: string | number
}

export const MAX_ATTRIBUTES_PER_TOKEN = 50
export const ATTRIBUTE_TRAIT_MAX = 80

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
  attributes?: NftAttribute[]
  imageUrl: string
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

export function validateAttributesList(
  attributes: NftAttribute[],
  context: string,
): string | null {
  if (attributes.length > MAX_ATTRIBUTES_PER_TOKEN) {
    return `${context}: At most ${MAX_ATTRIBUTES_PER_TOKEN} attributes allowed.`
  }

  const traits = new Set<string>()
  for (const attr of attributes) {
    const trait = String(attr.trait_type ?? '').trim()
    if (!trait) return `${context}: Each attribute needs a trait name.`
    if (trait.length > ATTRIBUTE_TRAIT_MAX) {
      return `${context}: Trait name must be ${ATTRIBUTE_TRAIT_MAX} characters or fewer.`
    }
    const key = trait.toLowerCase()
    if (traits.has(key)) {
      return `${context}: Duplicate trait "${trait}" in the same token.`
    }
    traits.add(key)

    const value = attr.value
    if (value === undefined || value === null || value === '') {
      return `${context}: Each attribute needs a value.`
    }
  }

  const royaltyError = validateNoMetadataRoyaltyFields({
    name: 'x',
    description: '',
    image: 'x',
    attributes,
  })
  if (royaltyError) return `${context}: ${royaltyError}`

  return null
}
