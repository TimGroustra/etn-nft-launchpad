import { type ReactNode, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { useAdmin } from '@/hooks/useAdmin'
import { useAvailableGems } from '@/hooks/use-available-gems'
import { canEditGallery, canViewGallery } from '@/lib/gallery-access'
import { WalletConnectButton } from '@/components/WalletConnectButton'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'

type GalleryRouteProps = {
  mode: 'view' | 'edit'
  children: ReactNode
}

export function GalleryRoute({ mode, children }: GalleryRouteProps) {
  const { address, isConnected } = useAccount()
  const { isAdmin } = useAdmin()
  const { ownedTokens, isLoading: gemsLoading } = useAvailableGems(address)
  const location = useLocation()

  useEffect(() => {
    if (!isConnected) return
    if (mode === 'view' && !canViewGallery(address, isAdmin)) {
      toast.error('3D Gallery is not available for this wallet during preview.')
    }
    if (mode === 'edit' && !gemsLoading && !canEditGallery(address, isAdmin, ownedTokens.length)) {
      toast.error('ElectroGem required to edit gallery panels.')
    }
  }, [address, isAdmin, isConnected, mode, ownedTokens.length, gemsLoading])

  if (!isConnected) {
    return (
      <Card className="max-w-lg">
        <CardTitle>Connect your wallet</CardTitle>
        <CardDescription className="mt-2">Connect your wallet to access the 3D Gallery.</CardDescription>
        <div className="mt-4">
          <WalletConnectButton />
        </div>
      </Card>
    )
  }

  if (mode === 'view' && !canViewGallery(address, isAdmin)) {
    return <Navigate to="/" replace state={{ from: location }} />
  }

  if (mode === 'edit') {
    if (gemsLoading) {
      return <div className="p-8 text-center text-slate-400">Checking ElectroGem holdings…</div>
    }
    if (!canEditGallery(address, isAdmin, ownedTokens.length)) {
      return <Navigate to="/gallery" replace />
    }
  }

  return <>{children}</>
}
