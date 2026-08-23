import { useAdmin } from '@/hooks/useAdmin'
import { useCreatorAccess } from '@/hooks/useCreatorAccess'
import { canAccessCreatorTools } from '@/lib/creator-access'

export function useCanAccessCreatorTools() {
  const { isAdmin } = useAdmin()
  const { holdings, hasCreatorAccess, holdingsLoading } = useCreatorAccess()

  return {
    isAdmin,
    hasCreatorAccess,
    holdingsLoading,
    canAccessCreatorTools: canAccessCreatorTools(isAdmin, holdings),
  }
}
