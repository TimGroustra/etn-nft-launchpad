import { useAccount, useDisconnect } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { Button } from '@/components/ui/button'
import { clearSession } from '@/lib/auth'
import { shortenAddress } from '@/lib/utils'

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
      <Button variant="outline" onClick={() => open()}>
        Connect Wallet
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => open()} title={address}>
        {shortenAddress(address)}
      </Button>
      <Button variant="ghost" size="sm" onClick={handleDisconnect}>
        Disconnect
      </Button>
    </div>
  )
}
