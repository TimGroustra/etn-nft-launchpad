import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { CreatorAccessUpsell } from '@/components/CreatorAccessUpsell'
import { WalletConnectButton } from '@/components/WalletConnectButton'
import { useCanAccessCreatorTools } from '@/hooks/useCanAccessCreatorTools'

type CreatorRouteProps = {
  children: ReactNode
}

export function CreatorRoute({ children }: CreatorRouteProps) {
  const { isConnected } = useAccount()
  const { canAccessCreatorTools, holdingsLoading } = useCanAccessCreatorTools()

  if (!isConnected) {
    return (
      <Card className="max-w-lg">
        <CardTitle>Connect your wallet</CardTitle>
        <CardDescription className="mt-2">Connect an Electroneum wallet to create collections.</CardDescription>
        <div className="mt-4">
          <WalletConnectButton />
        </div>
      </Card>
    )
  }

  if (holdingsLoading) {
    return <Card className="max-w-lg"><CardTitle>Checking creator access…</CardTitle></Card>
  }

  if (!canAccessCreatorTools) {
    return (
      <div className="space-y-6">
        <CreatorAccessUpsell />
        <Card>
          <CardDescription className="mt-2">
            Hold an ElectroGem or Club Watch NFT to unlock the create flow.
          </CardDescription>
          <Button variant="outline" className="mt-4" asChild>
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
