import { useAccount } from 'wagmi'
import { useNetwork } from '@/context/NetworkContext'
import { shortenAddress } from '@/lib/utils'

export function WalletAddress({ className }: { className?: string }) {
  const { address, isConnected, chainId: walletChainId } = useAccount()
  const { chain } = useNetwork()

  if (!isConnected || !address) return null

  const onWrongNetwork = walletChainId != null && walletChainId !== chain.id

  const suffix = address.slice(-4)

  return (
    <span
      className={`shrink-0 font-mono text-xs ${onWrongNetwork ? 'text-amber-400' : 'text-slate-300'} ${className ?? ''}`}
      title={onWrongNetwork ? `Switch to ${chain.name} in your wallet` : address}
    >
      {onWrongNetwork ? (
        'Wrong network'
      ) : (
        <>
          <span className="sm:hidden">...{suffix}</span>
          <span className="hidden sm:inline">{shortenAddress(address)}</span>
        </>
      )}
    </span>
  )
}
