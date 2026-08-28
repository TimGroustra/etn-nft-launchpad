import type { ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { WalletConnectButton } from '@/components/WalletConnectButton'

type CreatorRouteProps = {
  children: ReactNode
}

export function CreatorRoute({ children }: CreatorRouteProps) {
  const { isConnected } = useAccount()

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

  return <>{children}</>
}
