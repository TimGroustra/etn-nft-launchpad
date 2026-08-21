import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

export function getPublicImageUrl(path: string) {
  if (!path) return ''
  const { data } = supabase.storage.from('collection-images').getPublicUrl(path)
  return data.publicUrl
}

export function getPublicMetadataUrl(path: string) {
  if (!path) return ''
  const { data } = supabase.storage.from('collection-metadata').getPublicUrl(path)
  return data.publicUrl
}
