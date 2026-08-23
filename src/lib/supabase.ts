import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getPublicImageUrlFromPath,
  getPublicMetadataUrl as getPublicMetadataUrlByToken,
} from '@/lib/metadata-public-urls'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

export function getPublicImageUrl(path: string) {
  return getPublicImageUrlFromPath(path)
}

/** `path` is `{collectionId}/{tokenId}.json` */
export function getPublicMetadataUrl(path: string) {
  if (!path) return ''
  const normalized = path.replace(/^\/+/, '')
  const slash = normalized.indexOf('/')
  if (slash <= 0) return ''
  const collectionId = normalized.slice(0, slash)
  const file = normalized.slice(slash + 1)
  const match = /^(\d+)\.json$/i.exec(file)
  if (!match) return ''
  return getPublicMetadataUrlByToken(collectionId, Number(match[1]))
}
