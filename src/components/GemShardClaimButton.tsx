import { formatEther } from 'viem'
import { useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useGemShardRewards } from '@/hooks/useGemShardRewards'
import { useGemShardsLaunch } from '@/hooks/useGemShardsLaunch'
import { PUBLISH_FEE_DISTRIBUTOR_ABI } from '@/lib/gem-shards'
import { useNetwork } from '@/context/NetworkContext'

export function GemShardClaimButton() {
  const { chain } = useNetwork()
  const { writeContractAsync, isPending } = useWriteContract()
  const {
    configured,
    isConnected,
    distributorAddress,
    claimableTokenIds,
    totalPendingWei,
    loading,
  } = useGemShardRewards()
  const { isPublished } = useGemShardsLaunch()

  if (!configured || !isConnected || !isPublished || totalPendingWei <= 0n) {
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
      toast.success(`Claimed ${formatEther(totalPendingWei)} ETN from Gem Shards`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Claim failed')
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClaim}
      disabled={loading || isPending || claimableTokenIds.length === 0}
      className="border-emerald-800/60 text-emerald-300 hover:bg-emerald-950/40"
    >
      {loading || isPending
        ? 'Claiming…'
        : `Claim ${formatEther(totalPendingWei)} ETN`}
    </Button>
  )
}
