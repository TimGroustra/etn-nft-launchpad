import { formatEther } from 'viem'
import { useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EtnUsdHint } from '@/components/EtnUsdHint'
import { MintPanelStat, MintPanelStats } from '@/components/mint-panel/MintPanelUi'
import { useGemShardRewards } from '@/hooks/useGemShardRewards'
import { useGemShardsLaunch } from '@/hooks/useGemShardsLaunch'
import { PUBLISH_FEE_DISTRIBUTOR_ABI } from '@/lib/gem-shards'
import { useNetwork } from '@/context/NetworkContext'

function formatClaimBalance(wei: bigint): string {
  const etn = Number(formatEther(wei))
  return `${etn.toLocaleString(undefined, { maximumFractionDigits: 4 })} ETN`
}

export function GemShardRewardsPanel() {
  const { chain } = useNetwork()
  const { writeContractAsync, isPending } = useWriteContract()
  const {
    configured,
    isConnected,
    distributorAddress,
    shardBalance,
    ownsShards,
    ownedTokenIds,
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

  const shardCount = ownedTokenIds.length > 0 ? ownedTokenIds.length : Number(shardBalance)
  const claimableEtn = Number(formatEther(totalPendingWei))

  return (
    <Card className="border-emerald-900/40 bg-emerald-950/20 p-5">
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">Holder rewards</h2>
          <p className="text-sm text-slate-400">
            Gem Shard holders earn a share of launchpad publish fees. Rewards accrue as collections publish on ETN.
          </p>
        </div>

        <MintPanelStats>
          <MintPanelStat label="Your shards">
            {loading ? '…' : `${shardCount} shard${shardCount === 1 ? '' : 's'}`}
          </MintPanelStat>
          <MintPanelStat label="Available to claim" highlight>
            <div>
              <p className={totalPendingWei > 0n ? 'font-medium text-emerald-300' : 'text-slate-300'}>
                {loading ? '…' : formatClaimBalance(totalPendingWei)}
              </p>
              {!loading && <EtnUsdHint etn={claimableEtn} align="right" className="mt-0.5" />}
            </div>
          </MintPanelStat>
        </MintPanelStats>

        <div className="flex justify-end">
          {loading ? (
            <Button variant="outline" disabled>
              Checking rewards…
            </Button>
          ) : totalPendingWei > 0n ? (
            <Button
              className="border-emerald-800/60 bg-emerald-900/30 text-emerald-100 hover:bg-emerald-900/50"
              onClick={handleClaim}
              disabled={isPending || claimableTokenIds.length === 0}
            >
              {isPending ? 'Claiming…' : `Claim ${formatClaimBalance(totalPendingWei)}`}
            </Button>
          ) : (
            <Button variant="outline" disabled className="border-slate-700 text-slate-400">
              Nothing to claim yet
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
