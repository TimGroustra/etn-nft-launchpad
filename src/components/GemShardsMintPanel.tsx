import { useEffect, useMemo, useState } from 'react'
import { formatEther } from 'viem'
import { Link } from 'react-router-dom'
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import {
  MintPanelBadge,
  MintPanelCardActions,
  MintPanelCardBody,
  MintPanelCardDescription,
  MintPanelCardFooter,
  MintPanelCardHeader,
  MintPanelCardHero,
  MintPanelHighlight,
  mintPanelCardClass,
  mintPanelPrimaryButtonClass,
  mintPanelSecondaryButtonClass,
} from '@/components/mint-panel/MintPanelUi'
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
    <Button className={mintPanelPrimaryButtonClass('violet')} onClick={() => open()}>
      Connect wallet to mint
    </Button>
  ) : (
    <div className="space-y-3">
      {showFreeMintInfo && (
        <MintPanelHighlight tone="violet">
          {freeMintLoading ? (
            <p className="text-sm text-violet-100/80">Checking free mints…</p>
          ) : freeMintsRemaining > 0 ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium leading-none text-violet-100">
                  {freeMintsRemaining} free {freeMintsRemaining === 1 ? 'mint' : 'mints'} remaining
                </p>
                <MintPanelBadge tone="violet">ElectroGem</MintPanelBadge>
              </div>
              <Button
                className="mt-3 w-full border-violet-400/30 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20"
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
        </MintPanelHighlight>
      )}

      <div className="space-y-3 rounded-xl border border-slate-800/80 bg-slate-950/50 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4">
          <span className="text-sm text-slate-400">Paid mint</span>
          <span className="text-right text-sm font-semibold tabular-nums text-white">
            {formatPaidMintPriceLabel(paidPrice)}
            {hasDualHolderDiscount && paidPrice < GEM_SHARDS_PAID_MINT_PRICE ? (
              <span className="ml-1.5 text-xs font-medium text-emerald-400">50% off</span>
            ) : null}
          </span>
        </div>
        {weekOneActive && (
          <p className="text-xs leading-relaxed text-slate-500">
            {ownsElectroGem
              ? `ElectroGem holders only · public opens in ${countdownLabel ?? 'soon'}`
              : `Opens to everyone in ${countdownLabel ?? 'soon'}`}
          </p>
        )}
        <Button
          className={mintPanelPrimaryButtonClass('violet')}
          disabled={!paidMintAllowed || isPending || mintingPaid || mintingFree}
          onClick={mintPaid}
        >
          {paidMintLabel}
        </Button>
        {weekOneActive && !ownsElectroGem && (
          <p className="text-xs text-amber-300/90">Hold an ElectroGem to mint during week one.</p>
        )}
      </div>
    </div>
  )

  if (variant === 'panel') {
    return (
      <div className={mintPanelCardClass({ accent: 'violet' })}>
        <MintPanelCardHero src={GEM_SHARDS_CARD_IMAGE} alt={title} accent="violet" />
        <MintPanelCardBody>
          <div className="space-y-2">
            <MintPanelCardHeader
              title={title}
              badge={<MintPanelBadge tone="violet">Live</MintPanelBadge>}
            />
            <MintPanelCardDescription>{description}</MintPanelCardDescription>
          </div>
          <MintPanelCardActions>{mintActions}</MintPanelCardActions>
          {collection?.contract_address && (
            <MintPanelCardFooter>
              <Button variant="outline" size="sm" className={mintPanelSecondaryButtonClass()} asChild>
                <Link to={`/collection/${collection.contract_address}`}>View collection</Link>
              </Button>
            </MintPanelCardFooter>
          )}
        </MintPanelCardBody>
      </div>
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
