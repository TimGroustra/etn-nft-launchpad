import { useNetwork } from '@/context/NetworkContext'
import { Button } from '@/components/ui/button'

export function NetworkToggle() {
  const { network, setNetwork, switching, canSwitchNetwork } = useNetwork()

  if (!canSwitchNetwork) return null

  return (
    <div className="flex shrink-0 flex-wrap rounded-lg border border-slate-700 p-0.5 text-xs">
      <Button
        type="button"
        size="sm"
        variant={network === 'testnet' ? 'default' : 'ghost'}
        className="h-7 px-2.5"
        disabled={switching}
        onClick={() => setNetwork('testnet')}
      >
        Testnet
      </Button>
      <Button
        type="button"
        size="sm"
        variant={network === 'mainnet' ? 'default' : 'ghost'}
        className="h-7 px-2.5"
        disabled={switching}
        onClick={() => setNetwork('mainnet')}
      >
        Mainnet
      </Button>
    </div>
  )
}
