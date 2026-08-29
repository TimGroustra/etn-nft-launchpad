import { type ReactNode, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { useAvailableGems } from '@/hooks/use-available-gems'
import { canEditGallery } from '@/lib/gallery-access'
import { WalletConnectButton } from '@/components/WalletConnectButton'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'

type GalleryRouteProps = {
  mode: 'view' | 'edit'
  children: ReactNode
}

export function GalleryRoute({ mode, children }: GalleryRouteProps) {
  const { address, isConnected } = useAccount()
  const { ownedTokens, isLoading: gemsLoading } = useAvailableGems(address)

  useEffect(() => {
    if (!isConnected || mode !== 'edit') return
    if (!gemsLoading && !canEditGallery(ownedTokens.length)) {
      toast.error('ElectroGem required to edit gallery panels.')
    }
  }, [isConnected, mode, ownedTokens.length, gemsLoading])

  if (mode === 'edit') {
    if (!isConnected) {
      return (
        <Card className="max-w-lg">
          <CardTitle>Connect your wallet</CardTitle>
          <CardDescription className="mt-2">
            Connect a wallet holding at least one ElectroGem to configure gallery panels.
          </CardDescription>
          <div className="mt-4">
            <WalletConnectButton />
          </div>
        </Card>
      )
    }

    if (gemsLoading) {
      return <div className="p-8 text-center text-slate-400">Checking ElectroGem holdings…</div>
    }

    if (!canEditGallery(ownedTokens.length)) {
      return <Navigate to="/gallery" replace />
    }
  }

  return <>{children}</>
}
