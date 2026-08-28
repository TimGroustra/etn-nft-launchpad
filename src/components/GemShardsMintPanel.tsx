import { useEffect, useMemo, useState } from 'react'
import { formatEther } from 'viem'
import { Link } from 'react-router-dom'
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { EtnUsdHint } from '@/components/EtnUsdHint'
import { MintSuccessModal, type MintedTokenInfo } from '@/components/MintSuccessModal'
import {
  MintPanelBadge,
  MintPanelCardActions,
  MintPanelCardBody,
  MintPanelCardDescription,
  MintPanelCardFooter,
  MintPanelCardHeader,
  MintPanelCardHero,
  MintPanelHighlight,
  MintPanelMintSection,
  MintPanelStat,
  MintPanelStats,
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
  fetchGemShardsMintDisplayInfo,
  parseGemShardsMintReceipt,
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
  const [quantity, setQuantity] = useState(1)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [mintSuccessOpen, setMintSuccessOpen] = useState(false)
  const [mintedTokens, setMintedTokens] = useState<MintedTokenInfo[]>([])

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

  const { data: totalMinted } = useReadContract({
    address: contractAddress,
    abi: GEM_SHARDS_ABI,
    functionName: 'totalMinted',
    chainId,
    query: { enabled: mintingLive },
  })

  const { data: remainingSupply } = useReadContract({
    address: contractAddress,
    abi: GEM_SHARDS_ABI,
    functionName: 'remainingSupply',
    chainId,
    query: { enabled: mintingLive },
  })

  const paidPrice = requiredPaidMintPrice ?? GEM_SHARDS_PAID_MINT_PRICE
  const mintedCount = Number(totalMinted ?? 0n)
  const maxSupply = collection?.max_supply ?? 495
  const maxMintable = Math.max(0, Number(remainingSupply ?? BigInt(maxSupply - mintedCount)))
  const safeQuantity = Math.min(quantity, Math.max(1, maxMintable || 1))
  const totalPaidWei = paidPrice * BigInt(safeQuantity)
  const priceEtn = Number(formatEther(paidPrice))
  const totalEtn = Number(formatEther(totalPaidWei))
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

  async function showMintSuccess(tokenIds: number[]) {
    if (tokenIds.length === 0) return
    const displayInfo = await fetchGemShardsMintDisplayInfo(tokenIds)
    setMintedTokens(
      displayInfo.map((info) => ({
        tokenId: info.tokenId,
        name: info.name,
        imageUrl: info.imageUrl,
      })),
    )
    setMintSuccessOpen(true)
  }

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
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        const tokenIds = parseGemShardsMintReceipt(receipt, contractAddress)
        showMintSuccess(tokenIds)
      }
      toast.success('Minted your free Gem Shard')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Free mint failed')
    } finally {
      setMintingFree(false)
    }
  }

  async function mintPaid() {
    if (!address || !publicClient || safeQuantity < 1) return
    setMintingPaid(true)
    let minted = 0
    const mintedTokenIds: number[] = []
    try {
      for (let index = 0; index < safeQuantity; index += 1) {
        const hash = await writeContractAsync({
          address: contractAddress,
          abi: GEM_SHARDS_ABI,
          functionName: 'mintPaid',
          value: paidPrice,
          chainId: chain.id,
        })
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        mintedTokenIds.push(...parseGemShardsMintReceipt(receipt, contractAddress))
        minted += 1
      }
      showMintSuccess(mintedTokenIds)
      toast.success(`Minted ${minted} Gem Shard${minted === 1 ? '' : 's'}`)
      setQuantity(1)
    } catch (error) {
      if (minted > 0) {
        showMintSuccess(mintedTokenIds)
        toast.error(
          error instanceof Error
            ? `Minted ${minted} of ${safeQuantity} before failing: ${error.message}`
            : `Minted ${minted} of ${safeQuantity} before failing.`,
        )
      } else {
        toast.error(error instanceof Error ? error.message : 'Paid mint failed')
      }
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

  const paidMintLabel = mintingPaid
    ? `Minting${safeQuantity > 1 ? ` ${safeQuantity}…` : '…'}`
    : `Mint ${safeQuantity} for ${totalEtn.toLocaleString()} ETN`
  const showFreeMintInfo = isConnected && ownsElectroGem
  const saleActive = maxMintable > 0

  const mintActions = isDraft ? (
    <CardDescription>Minting is disabled until you publish from the Dashboard.</CardDescription>
  ) : (
    <div className="space-y-3">
      <MintPanelStats>
        <MintPanelStat label="Price">
          <div>
            {formatPaidMintPriceLabel(paidPrice)}
            {hasDualHolderDiscount && paidPrice < GEM_SHARDS_PAID_MINT_PRICE ? (
              <span className="ml-1.5 text-xs font-medium text-emerald-400">50% off</span>
            ) : null}
          </div>
          <EtnUsdHint etn={priceEtn} align="right" className="mt-0.5" />
        </MintPanelStat>
        <MintPanelStat label="Minted">
          {mintedCount} / {maxSupply}
        </MintPanelStat>
        <MintPanelStat label="Remaining">{maxMintable}</MintPanelStat>
      </MintPanelStats>

      {!isConnected ? (
        <Button className={mintPanelPrimaryButtonClass('violet')} onClick={() => open()}>
          Connect wallet to mint
        </Button>
      ) : (
        <>
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

          <MintPanelMintSection>
            {weekOneActive && (
              <p className="text-xs leading-relaxed text-slate-500">
                {ownsElectroGem
                  ? `ElectroGem holders only · public opens in ${countdownLabel ?? 'soon'}`
                  : `Opens to everyone in ${countdownLabel ?? 'soon'}`}
              </p>
            )}
            {!saleActive ? (
              <p className="text-sm text-slate-400">This collection is sold out.</p>
            ) : (
              <>
                <div>
                  <Label htmlFor={`gem-shards-mint-qty-${collection?.id ?? 'panel'}`}>Quantity</Label>
                  <Input
                    id={`gem-shards-mint-qty-${collection?.id ?? 'panel'}`}
                    type="number"
                    min={1}
                    max={maxMintable}
                    value={safeQuantity}
                    disabled={mintingPaid || mintingFree}
                    onChange={(event) =>
                      setQuantity(Math.max(1, Math.min(maxMintable, Number(event.target.value) || 1)))
                    }
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    One shard per transaction · up to {maxMintable} remaining
                  </p>
                </div>
                <Button
                  className={mintPanelPrimaryButtonClass('violet')}
                  disabled={!paidMintAllowed || isPending || mintingPaid || mintingFree}
                  onClick={mintPaid}
                >
                  {paidMintLabel}
                </Button>
                <EtnUsdHint etn={totalEtn} align="right" className="-mt-1" />
              </>
            )}
            {weekOneActive && !ownsElectroGem && saleActive && (
              <p className="text-xs text-amber-300/90">Hold an ElectroGem to mint during week one.</p>
            )}
          </MintPanelMintSection>
        </>
      )}
    </div>
  )

  const mintSuccessModal = (
    <MintSuccessModal
      open={mintSuccessOpen}
      onOpenChange={setMintSuccessOpen}
      collectionName={title}
      contractAddress={contractAddress}
      chainId={chainId}
      mintedTokens={mintedTokens}
    />
  )

  if (variant === 'panel') {
    return (
      <>
        {mintSuccessModal}
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
      </>
    )
  }

  return (
    <>
      {mintSuccessModal}
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
    </>
  )
}
