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
  const [mintingFreeId, setMintingFreeId] = useState<number | null>(null)
  const [mintingPaid, setMintingPaid] = useState(false)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  const mintingLive = isPublished && !isDraft

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

  async function mintFree(electroGemTokenId: number) {
    if (!address) return
    setMintingFreeId(electroGemTokenId)
    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: GEM_SHARDS_ABI,
        functionName: 'mintFree',
        args: [BigInt(electroGemTokenId)],
        chainId: chain.id,
      })
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash })
      toast.success(`Minted free Gem Shard for ElectroGem #${electroGemTokenId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Free mint failed')
    } finally {
      setMintingFreeId(null)
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
        <CardTitle>{collection?.name ?? 'Gem Shards'}</CardTitle>
        <CardDescription className="mt-2">Coming soon.</CardDescription>
      </Card>
    )
  }

  const title = collection?.name ?? 'Gem Shards'
  const description =
    collection?.description
    ?? 'Hold Gem Shards to earn a share of launchpad platform fees. ElectroGem holders get one free shard per gem (IDs 1–49).'

  const mintContent = isDraft ? (
    <CardDescription>Minting is disabled until you publish from the Dashboard.</CardDescription>
  ) : !isConnected ? (
    <Button onClick={() => open()}>Connect wallet</Button>
  ) : (
    <div className={variant === 'page' ? 'grid gap-4 md:grid-cols-2' : 'space-y-4'}>
      <div className={variant === 'panel' ? 'space-y-2' : undefined}>
        {variant === 'page' ? <CardTitle className="text-base">Free mint</CardTitle> : null}
        <p className="text-sm text-slate-400">One free shard per ElectroGem token you own (1–49).</p>
        {freeMintLoading ? (
          <p className="text-sm text-slate-500">Checking eligibility…</p>
        ) : eligibleTokenIds.length === 0 ? (
          <p className="text-sm text-slate-500">No free mints available.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {eligibleTokenIds.map((tokenId) => (
              <Button
                key={tokenId}
                variant="outline"
                size={variant === 'panel' ? 'sm' : 'default'}
                disabled={isPending || mintingFreeId != null}
                onClick={() => mintFree(tokenId)}
              >
                {mintingFreeId === tokenId ? 'Minting…' : `Free (EG #${tokenId})`}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className={variant === 'panel' ? 'space-y-2' : undefined}>
        {variant === 'page' ? <CardTitle className="text-base">Paid mint</CardTitle> : null}
        <p className="text-sm text-slate-400">
          {weekOneActive
            ? `ElectroGem holders only · public in ${countdownLabel ?? 'soon'}`
            : 'Open to all wallets.'}
        </p>
        <p className="text-lg font-medium text-white">
          {formatPaidMintPriceLabel(paidPrice)}
          {hasDualHolderDiscount && paidPrice < GEM_SHARDS_PAID_MINT_PRICE ? (
            <span className="ml-2 text-sm text-emerald-400">50% off</span>
          ) : null}
        </p>
        <Button
          className={variant === 'panel' ? 'w-full' : undefined}
          disabled={!paidMintAllowed || isPending || mintingPaid}
          onClick={mintPaid}
        >
          {mintingPaid ? 'Minting…' : `Mint for ${formatEther(paidPrice)} ETN`}
        </Button>
        {weekOneActive && !ownsElectroGem && (
          <p className="text-sm text-amber-300">Hold an ElectroGem to mint during week one.</p>
        )}
      </div>
    </div>
  )

  if (variant === 'panel') {
    return (
      <Card className="flex h-full flex-col p-4 sm:p-6">
        <CardTitle>{title}</CardTitle>
        <CardDescription className="mt-1 line-clamp-2">{description}</CardDescription>
        <div className="mt-4 flex-1">{mintContent}</div>
        {collection?.contract_address && (
          <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
            <Link to={`/collection/${collection.contract_address}`}>View collection</Link>
          </Button>
        )}
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {isDraft && isAdmin && (
          <p className="mt-2 rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
            Draft — publish from your Dashboard when ready.
          </p>
        )}
        <p className="mt-2 max-w-2xl text-slate-400">{description}</p>
      </div>
      {variant === 'page' && isDraft ? (
        <Card className="border-slate-800 bg-slate-900/60 p-6">{mintContent}</Card>
      ) : (
        mintContent
      )}
    </div>
  )
}
