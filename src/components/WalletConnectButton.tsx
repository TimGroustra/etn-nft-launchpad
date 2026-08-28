import { useAccount, useDisconnect } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { Button } from '@/components/ui/button'
import { clearSession } from '@/lib/auth'

export function WalletConnectButton({ className }: { className?: string }) {
  const { address, isConnected } = useAccount()
  const { open } = useAppKit()
  const { disconnect } = useDisconnect()

  const handleDisconnect = () => {
    clearSession()
    disconnect()
  }

  if (!isConnected || !address) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={className}
        onClick={() => open({ view: 'Connect' })}
      >
        Connect Wallet
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={handleDisconnect}
      title={address}
    >
      Disconnect
    </Button>
  )
}
