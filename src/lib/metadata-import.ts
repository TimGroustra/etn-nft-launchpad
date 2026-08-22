import {
  type NftAttribute,
  type NftMetadata,
  validateNoMetadataRoyaltyFields,
} from '@/lib/nft-metadata'
import { TOKEN_DESC_MAX, TOKEN_NAME_MAX } from '@/lib/create-collection-validation'

export const MAX_ATTRIBUTES_PER_TOKEN = 50
export const ATTRIBUTE_TRAIT_MAX = 80

export type ParsedTokenMetadata = {
  name?: string
  description?: string
  attributes: NftAttribute[]
}

export function normalizeAttributes(raw: unknown): NftAttribute[] | null {
  if (raw == null) return []
  if (!Array.isArray(raw)) return null

  const attributes: NftAttribute[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const trait_type = String((item as { trait_type?: unknown }).trait_type ?? '').trim()
    const valueRaw = (item as { value?: unknown }).value
    if (!trait_type) return null
    if (valueRaw === undefined || valueRaw === null || valueRaw === '') return null
    const value = typeof valueRaw === 'number' ? valueRaw : String(valueRaw).trim()
    if (value === '' && typeof valueRaw !== 'number') return null
    attributes.push({ trait_type, value })
  }
  return attributes
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
    const trait = attr.trait_type.trim()
    if (!trait) return `${context}: Each attribute needs a trait name.`
    if (trait.length > ATTRIBUTE_TRAIT_MAX) {
      return `${context}: Trait "${trait.slice(0, 20)}…" must be ${ATTRIBUTE_TRAIT_MAX} characters or fewer.`
    }
    const key = trait.toLowerCase()
    if (traits.has(key)) {
      return `${context}: Duplicate trait "${trait}" in the same token.`
    }
    traits.add(key)
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

export function parseMetadataJson(text: string, context: string): { data: ParsedTokenMetadata } | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: `${context}: Invalid JSON.` }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: `${context}: Metadata must be a JSON object.` }
  }

  const record = parsed as Record<string, unknown>
  const royaltyError = validateNoMetadataRoyaltyFields(record)
  if (royaltyError) return { error: `${context}: ${royaltyError}` }

  const name = record.name != null ? String(record.name).trim() : undefined
  const description = record.description != null ? String(record.description).trim() : undefined

  if (name && name.length > TOKEN_NAME_MAX) {
    return { error: `${context}: Name must be ${TOKEN_NAME_MAX} characters or fewer.` }
  }
  if (description && description.length > TOKEN_DESC_MAX) {
    return { error: `${context}: Description must be ${TOKEN_DESC_MAX} characters or fewer.` }
  }

  const attributes = normalizeAttributes(record.attributes)
  if (attributes === null) {
    return { error: `${context}: "attributes" must be an array of { "trait_type", "value" } objects.` }
  }

  const attrError = validateAttributesList(attributes, context)
  if (attrError) return { error: attrError }

  return {
    data: {
      name: name || undefined,
      description: description || undefined,
      attributes,
    },
  }
}

export function buildPreviewMetadata(input: {
  name: string
  description?: string | null
  attributes?: NftAttribute[]
  imageUrl?: string
}): NftMetadata {
  return {
    name: input.name.trim(),
    description: (input.description ?? '').trim(),
    image: input.imageUrl ?? '(uploaded when you save — public URL generated automatically)',
    attributes: input.attributes ?? [],
  }
}
