import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { WalletConnectButton } from '@/components/WalletConnectButton'
import { useAdmin } from '@/hooks/useAdmin'

type AdminRouteProps = {
  children: ReactNode
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { isConnected } = useAccount()
  const { isAdmin } = useAdmin()

  if (!isConnected) {
    return (
      <Card className="max-w-lg">
        <CardTitle>Admin access required</CardTitle>
        <CardDescription className="mt-2">Connect the admin wallet to create collections.</CardDescription>
        <div className="mt-4">
          <WalletConnectButton />
        </div>
      </Card>
    )
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
