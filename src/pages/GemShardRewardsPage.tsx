import { Link } from 'react-router-dom'
import { formatEther } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { useAppKit } from '@reown/appkit/react'
import { useAccount, useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EtnUsdHint } from '@/components/EtnUsdHint'
import { useGemShardRewards } from '@/hooks/useGemShardRewards'
import { useGemShardsLaunch } from '@/hooks/useGemShardsLaunch'
import { useNetwork } from '@/context/NetworkContext'
import {
  GEM_SHARDS_CARD_IMAGE,
  GEM_SHARDS_MAX_SUPPLY,
  PUBLISH_FEE_DISTRIBUTOR_ABI,
} from '@/lib/gem-shards'

function formatRewardBalance(wei: bigint): string {
  const etn = Number(formatEther(wei))
  return `${etn.toLocaleString(undefined, { maximumFractionDigits: 4 })} ETN`
}

export function GemShardRewardsPage() {
  const queryClient = useQueryClient()
  const { open } = useAppKit()
  const { isConnected } = useAccount()
  const { chain } = useNetwork()
  const { writeContractAsync, isPending: claiming } = useWriteContract()
  const { gemShardsAddress, loading: launchLoading } = useGemShardsLaunch()
  const {
    configured,
    distributorAddress,
    shardBalance,
    ownsShards,
    claimableTokenIds,
    totalPendingWei,
    loading: rewardsLoading,
  } = useGemShardRewards()

  const shardCount = isConnected ? Number(shardBalance) : 0
  const pendingEtn = isConnected ? Number(formatEther(totalPendingWei)) : 0
  const loading = isConnected && (launchLoading || rewardsLoading)
  const canClaim = isConnected && ownsShards && claimableTokenIds.length > 0 && totalPendingWei > 0n

  async function handleClaim() {
    if (!canClaim) return
    try {
      await writeContractAsync({
        address: distributorAddress,
        abi: PUBLISH_FEE_DISTRIBUTOR_ABI,
        functionName: 'claimBatch',
        args: [claimableTokenIds.map((id) => BigInt(id))],
        chainId: chain.id,
      })
      toast.success(`Claimed ${formatRewardBalance(totalPendingWei)}`)
      await queryClient.invalidateQueries({ queryKey: ['gem-shard-owned'] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Claim failed')
    }
  }

  if (!launchLoading && !configured) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center">
        <h1 className="text-2xl font-semibold text-white">Gem Shard rewards</h1>
        <p className="mt-3 text-slate-400">Gem Shards are not live on this network yet.</p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/">Back to mint</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-violet-900/40">
        <img
          src={GEM_SHARDS_CARD_IMAGE}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/95 via-slate-950/85 to-violet-950/80" />
        <div className="pointer-events-none absolute -right-10 top-10 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/4 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" />

        <div className="relative px-6 py-10 sm:px-10 sm:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/90">
            Holder rewards
          </p>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Gem Shards
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            495 radiant shards crystallize launchpad energy into lasting holder value. Every shard
            earns an equal share of platform fees. Hold more shards, earn more rewards.
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <section className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 sm:p-8">
          <div>
            <h2 className="text-lg font-semibold text-white">What Gem Shards do</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Gem Shards are the launchpad&apos;s 495-piece holder collection. When fees flow to
              the distributor, half goes to the treasury and half is shared across all 495 shards.
              Each shard is one equal share. Only shards #491–#495 earn double.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Where rewards come from</h2>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-slate-400">
              <li>Collection publish fees routed through the launchpad</li>
              <li>Platform mint fees from public collections</li>
              <li>Direct ETN sent to the fee distributor</li>
            </ul>
            <p className="mt-3 text-sm text-slate-500">
              Rewards accrue while you hold a shard. Claim anytime; no expiry.
            </p>
          </div>
          {gemShardsAddress && (
            <Button asChild variant="outline" className="border-violet-800/60 text-violet-200 hover:bg-violet-950/40">
              <Link to={`/collection/${gemShardsAddress}`}>Mint a Gem Shard</Link>
            </Button>
          )}
        </section>

        <aside className="flex flex-col gap-4 rounded-2xl border border-emerald-900/30 bg-gradient-to-b from-emerald-950/30 to-slate-950 p-6">
          <h2 className="text-lg font-semibold text-white">Your rewards</h2>

          {loading ? (
            <p className="text-sm text-slate-400">Loading your rewards…</p>
          ) : (
            <>
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Shards held</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-white">
                  {shardCount}
                  <span className="text-lg font-normal text-slate-500"> / {GEM_SHARDS_MAX_SUPPLY}</span>
                </p>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Available to claim</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-300">
                  {formatRewardBalance(isConnected ? totalPendingWei : 0n)}
                </p>
                {pendingEtn > 0 && <EtnUsdHint etn={pendingEtn} className="mt-1" />}
              </div>

              {!isConnected ? (
                <Button className="w-full" onClick={() => open({ view: 'Connect' })}>
                  Connect wallet
                </Button>
              ) : (
                <Button
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50"
                  disabled={!canClaim || claiming}
                  onClick={handleClaim}
                >
                  {claiming ? 'Claiming…' : 'Claim rewards'}
                </Button>
              )}

              {!isConnected && (
                <p className="text-xs text-slate-500">
                  Connect your wallet to verify holdings and claim rewards.
                </p>
              )}
              {isConnected && !ownsShards && (
                <p className="text-xs text-slate-500">
                  You don&apos;t hold any Gem Shards yet. Mint one to start earning launchpad fees.
                </p>
              )}
              {isConnected && ownsShards && totalPendingWei === 0n && (
                <p className="text-xs text-slate-500">
                  No rewards to claim right now. Fees will appear here as they are distributed.
                </p>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
