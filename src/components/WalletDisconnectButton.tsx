import { DoorOpen } from 'lucide-react'
import { useAccount, useDisconnect } from 'wagmi'
import { Button } from '@/components/ui/button'
import { clearSession } from '@/lib/auth'
import { clearHolderPerksDismissed } from '@/lib/holder-perks-dismiss'

export function WalletDisconnectButton({ className }: { className?: string }) {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()

  if (!isConnected || !address) return null

  const handleDisconnect = () => {
    clearHolderPerksDismissed(address)
    clearSession()
    disconnect()
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`h-7 w-7 shrink-0 px-0 text-red-500 hover:bg-red-500/10 hover:text-red-400 ${className ?? ''}`}
      onClick={handleDisconnect}
      title={`Disconnect ${address}`}
      aria-label="Disconnect wallet"
    >
      <DoorOpen className="h-4 w-4" />
    </Button>
  )
}
