import { formatEther } from 'viem'
import { useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useGemShardRewards } from '@/hooks/useGemShardRewards'
import { PUBLISH_FEE_DISTRIBUTOR_ABI } from '@/lib/gem-shards'
import { useNetwork } from '@/context/NetworkContext'

function formatClaimBalance(wei: bigint): string {
  const etn = Number(formatEther(wei))
  return `${etn.toLocaleString(undefined, { maximumFractionDigits: 4 })} ETN`
}

/** Compact header claim action — only when there is ETN ready to claim. */
export function GemShardClaimButton() {
  const { chain } = useNetwork()
  const { writeContractAsync, isPending } = useWriteContract()
  const {
    configured,
    isConnected,
    distributorAddress,
    ownsShards,
    claimableTokenIds,
    totalPendingWei,
    loading,
  } = useGemShardRewards()

  if (!configured || !isConnected || !ownsShards || loading || totalPendingWei <= 0n) {
    return null
  }

  async function handleClaim() {
    if (claimableTokenIds.length === 0) return
    try {
      await writeContractAsync({
        address: distributorAddress,
        abi: PUBLISH_FEE_DISTRIBUTOR_ABI,
        functionName: 'claimBatch',
        args: [claimableTokenIds.map((id) => BigInt(id))],
        chainId: chain.id,
      })
      toast.success(`Claimed ${formatClaimBalance(totalPendingWei)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Claim failed')
    }
  }

  const balanceLabel = formatClaimBalance(totalPendingWei)

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClaim}
      disabled={isPending || claimableTokenIds.length === 0}
      className="h-7 shrink-0 border-emerald-800/60 px-2 text-xs text-emerald-300 hover:bg-emerald-950/40 sm:h-8 sm:px-3 sm:text-sm"
      title="Claim Gem Shard holder rewards"
    >
      {isPending ? 'Claiming…' : (
        <>
          <span className="sm:hidden">Claim</span>
          <span className="hidden sm:inline">Claim {balanceLabel}</span>
        </>
      )}
    </Button>
  )
}
