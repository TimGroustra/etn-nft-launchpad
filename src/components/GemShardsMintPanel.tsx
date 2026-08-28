import { useEffect, useMemo, useState } from 'react'
import { formatEther } from 'viem'
import { Link } from 'react-router-dom'
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { useNetwork } from '@/context/NetworkContext'
import { useCreatorAccess } from '@/hooks/useCreatorAccess'
import { useElectroGemFreeMints } from '@/hooks/useElectroGemFreeMints'
import { useGemShardsLaunch } from '@/hooks/useGemShardsLaunch'
import { useAdmin } from '@/hooks/useAdmin'
import {
  GEM_SHARDS_ABI,
  GEM_SHARDS_CARD_IMAGE,
  GEM_SHARDS_MINT_CARD_DESCRIPTION,
  GEM_SHARDS_PAID_MINT_PRICE,
  formatPaidMintPriceLabel,
  type GemShardsContractAddress,
} from '@/lib/gem-shards'
import type { Collection } from '@/types/database'

function formatCountdown(seconds: number): string {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

type GemShardsMintPanelProps = {
  contractAddress: GemShardsContractAddress
  chainId: number
  variant?: 'page' | 'panel'
  collection?: Collection
}

export function GemShardsMintPanel({
  contractAddress,
  chainId,
  variant = 'page',
  collection,
}: GemShardsMintPanelProps) {
  const { address, isConnected } = useAccount()
  const { open } = useAppKit()
  const { chain } = useNetwork()
  const { isAdmin } = useAdmin()
  const { hasDualHolderDiscount } = useCreatorAccess()
  const { isPublished, isDraft, loading: launchLoading } = useGemShardsLaunch()
  const { eligibleTokenIds, ownsElectroGem, loading: freeMintLoading } = useElectroGemFreeMints()
  const publicClient = usePublicClient({ chainId })
  const { writeContractAsync, isPending } = useWriteContract()
  const [mintingFree, setMintingFree] = useState(false)
  const [mintingPaid, setMintingPaid] = useState(false)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  const mintingLive = isPublished && !isDraft
  const freeMintsRemaining = eligibleTokenIds.length
  const title = collection?.name ?? 'Gem Shards'
  const description = GEM_SHARDS_MINT_CARD_DESCRIPTION

  const { data: publicSaleOpensAt } = useReadContract({
    address: contractAddress,
    abi: GEM_SHARDS_ABI,
    functionName: 'publicSaleOpensAt',
    chainId,
    query: { enabled: mintingLive },
  })

  const { data: requiredPaidMintPrice } = useReadContract({
    address: contractAddress,
    abi: GEM_SHARDS_ABI,
    functionName: 'requiredPaidMintPrice',
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: mintingLive && Boolean(address) },
  })

  const paidPrice = requiredPaidMintPrice ?? GEM_SHARDS_PAID_MINT_PRICE
  const weekOneActive = publicSaleOpensAt != null && BigInt(now) < publicSaleOpensAt
  const paidMintAllowed = !weekOneActive || ownsElectroGem

  const countdownLabel = useMemo(() => {
    if (!weekOneActive || publicSaleOpensAt == null) return null
    const remaining = Number(publicSaleOpensAt) - now
    return formatCountdown(Math.max(0, remaining))
  }, [weekOneActive, publicSaleOpensAt, now])

  useEffect(() => {
    if (!weekOneActive) return undefined
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000)
    return () => window.clearInterval(timer)
  }, [weekOneActive])

  async function mintFree() {
    const electroGemTokenId = eligibleTokenIds[0]
    if (!address || electroGemTokenId == null) return
    setMintingFree(true)
    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: GEM_SHARDS_ABI,
        functionName: 'mintFree',
        args: [BigInt(electroGemTokenId)],
        chainId: chain.id,
      })
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash })
      toast.success('Minted your free Gem Shard')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Free mint failed')
    } finally {
      setMintingFree(false)
    }
  }

  async function mintPaid() {
    if (!address) return
    setMintingPaid(true)
    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: GEM_SHARDS_ABI,
        functionName: 'mintPaid',
        value: paidPrice,
        chainId: chain.id,
      })
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash })
      toast.success('Minted Gem Shard')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Paid mint failed')
    } finally {
      setMintingPaid(false)
    }
  }

  if (launchLoading) {
    return <p className="text-slate-500">Loading…</p>
  }

  if (isDraft && !isAdmin) {
    return variant === 'panel' ? null : (
      <Card className="border-slate-800 bg-slate-900/60 p-6">
        <CardTitle>{title}</CardTitle>
        <CardDescription className="mt-2">Coming soon.</CardDescription>
      </Card>
    )
  }

  const paidMintLabel = mintingPaid ? 'Minting…' : `Mint for ${formatEther(paidPrice)} ETN`
  const showFreeMintInfo = isConnected && ownsElectroGem

  const mintActions = isDraft ? (
    <CardDescription>Minting is disabled until you publish from the Dashboard.</CardDescription>
  ) : !isConnected ? (
    <Button className="w-full" onClick={() => open()}>
      Connect wallet to mint
    </Button>
  ) : (
    <div className="space-y-3">
      {showFreeMintInfo && (
        <div className="rounded-lg border border-violet-900/40 bg-violet-950/20 px-3 py-2">
          {freeMintLoading ? (
            <p className="text-sm text-slate-400">Checking free mints…</p>
          ) : freeMintsRemaining > 0 ? (
            <>
              <p className="text-sm text-violet-200">
                {freeMintsRemaining} free {freeMintsRemaining === 1 ? 'mint' : 'mints'} remaining
              </p>
              <Button
                className="mt-2 w-full"
                variant="outline"
                disabled={isPending || mintingFree || mintingPaid}
                onClick={mintFree}
              >
                {mintingFree ? 'Minting…' : 'Mint free shard'}
              </Button>
            </>
          ) : (
            <p className="text-sm text-slate-400">No free mints remaining</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-slate-400">Paid mint</span>
          <span className="text-right text-sm font-medium text-white">
            {formatPaidMintPriceLabel(paidPrice)}
            {hasDualHolderDiscount && paidPrice < GEM_SHARDS_PAID_MINT_PRICE ? (
              <span className="ml-1 text-emerald-400">50% off</span>
            ) : null}
          </span>
        </div>
        {weekOneActive && (
          <p className="text-xs text-slate-500">
            {ownsElectroGem
              ? `ElectroGem holders only · public opens in ${countdownLabel ?? 'soon'}`
              : `Opens to everyone in ${countdownLabel ?? 'soon'}`}
          </p>
        )}
        <Button
          className="w-full"
          disabled={!paidMintAllowed || isPending || mintingPaid || mintingFree}
          onClick={mintPaid}
        >
          {paidMintLabel}
        </Button>
        {weekOneActive && !ownsElectroGem && (
          <p className="text-xs text-amber-300">Hold an ElectroGem to mint during week one.</p>
        )}
      </div>
    </div>
  )

  if (variant === 'panel') {
    return (
      <Card className="flex h-full flex-col overflow-hidden">
        <img
          src={GEM_SHARDS_CARD_IMAGE}
          alt={title}
          className="aspect-square w-full object-cover"
        />
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <CardTitle>{title}</CardTitle>
          <CardDescription className="mt-1 line-clamp-3">{description}</CardDescription>
          <div className="mt-4 flex-1">{mintActions}</div>
          {collection?.contract_address && (
            <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
              <Link to={`/collection/${collection.contract_address}`}>View collection</Link>
            </Button>
          )}
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-[minmax(0,280px)_1fr] md:items-start">
        <img
          src={GEM_SHARDS_CARD_IMAGE}
          alt={title}
          className="aspect-square w-full max-w-xs rounded-xl border border-slate-800 object-cover"
        />
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {isDraft && isAdmin && (
            <p className="mt-2 rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
              Draft — publish from your Dashboard when ready.
            </p>
          )}
          <p className="mt-2 max-w-2xl text-slate-400">{description}</p>
        </div>
      </div>
      {variant === 'page' && isDraft ? (
        <Card className="border-slate-800 bg-slate-900/60 p-6">{mintActions}</Card>
      ) : (
        <Card className="border-slate-800 bg-slate-900/60 p-6">{mintActions}</Card>
      )}
    </div>
  )
}
