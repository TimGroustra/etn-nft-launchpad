import { useAccount, useDisconnect } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { Button } from '@/components/ui/button'
import { clearSession } from '@/lib/auth'

export function WalletConnectButton() {
  const { address, isConnected } = useAccount()
  const { open } = useAppKit()
  const { disconnect } = useDisconnect()

  const handleDisconnect = () => {
    clearSession()
    disconnect()
  }

  if (!isConnected || !address) {
    return (
      <Button variant="outline" size="sm" onClick={() => open({ view: 'Connect' })}>
        Connect Wallet
      </Button>
    )
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDisconnect} title={address}>
      Disconnect
    </Button>
  )
}
