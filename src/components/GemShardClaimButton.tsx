import { formatEther } from 'viem'
import { useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useGemShardRewards } from '@/hooks/useGemShardRewards'
import { useGemShardsLaunch } from '@/hooks/useGemShardsLaunch'
import { PUBLISH_FEE_DISTRIBUTOR_ABI } from '@/lib/gem-shards'
import { useNetwork } from '@/context/NetworkContext'

function formatClaimBalance(wei: bigint): string {
  const etn = Number(formatEther(wei))
  return `${etn.toLocaleString(undefined, { maximumFractionDigits: 4 })} ETN`
}

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
  const { isPublished } = useGemShardsLaunch()

  if (!configured || !isConnected || !isPublished || !ownsShards) {
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

  const balanceLabel = loading ? '…' : formatClaimBalance(totalPendingWei)

  if (totalPendingWei <= 0n) {
    return (
      <span
        className="hidden text-xs tabular-nums text-emerald-300/80 sm:inline"
        title="Gem Shard holder rewards available to claim"
      >
        {balanceLabel}
      </span>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClaim}
      disabled={loading || isPending || claimableTokenIds.length === 0}
      className="hidden border-emerald-800/60 text-emerald-300 hover:bg-emerald-950/40 sm:inline-flex"
      title="Claim Gem Shard holder rewards"
    >
      {loading || isPending ? 'Claiming…' : `Claim ${balanceLabel}`}
    </Button>
  )
}
