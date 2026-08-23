import { useAccount, useBalance } from 'wagmi'
import { formatEther } from 'viem'
import { useNetwork } from '@/context/NetworkContext'

function formatWalletBalance(wei: bigint): string {
  const etn = Number(formatEther(wei))
  if (etn === 0) return '0'
  if (etn < 0.0001) return '<0.0001'
  if (etn >= 1_000_000) return `${(etn / 1_000_000).toFixed(2)}M`
  if (etn >= 10_000) return etn.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return etn.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

export function WalletBalance() {
  const { address, isConnected, chainId: walletChainId } = useAccount()
  const { chain } = useNetwork()
  const { data, isLoading, isError } = useBalance({
    address,
    chainId: chain.id,
    query: { enabled: isConnected && Boolean(address) },
  })

  if (!isConnected || !address) return null

  const onWrongNetwork = walletChainId != null && walletChainId !== chain.id
  const label = onWrongNetwork
    ? 'Wrong network'
    : isLoading
      ? '…'
      : isError || !data
        ? '—'
        : `${formatWalletBalance(data.value)} ${data.symbol}`

  return (
    <span
      className={`shrink-0 text-xs tabular-nums sm:max-w-none ${onWrongNetwork ? 'text-amber-400' : 'text-slate-300'}`}
      title={
        onWrongNetwork
          ? `Switch to ${chain.name} in your wallet`
          : data
            ? `${formatEther(data.value)} ${data.symbol}`
            : undefined
      }
    >
      {label}
    </span>
  )
}
