import { useCallback, useEffect, useState } from 'react'

import { Link } from 'react-router-dom'

import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { formatEther } from 'viem'

import { useAppKit } from '@reown/appkit/react'

import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import { Card, CardDescription, CardTitle } from '@/components/ui/card'

import { Input, Label } from '@/components/ui/input'

import { buildMintedTokenInfo, MintSuccessModal, type MintedTokenInfo } from '@/components/MintSuccessModal'
import { EtnUsdHint } from '@/components/EtnUsdHint'
import { useCollectionTokens, useMintPanelCollections } from '@/hooks/useCollections'
import { useMintPanelAvailability } from '@/hooks/useMintPanelAvailability'
import { usePlatformConfig } from '@/hooks/usePlatformConfig'

import { useNetwork } from '@/context/NetworkContext'

import { useAdmin } from '@/hooks/useAdmin'

import { useCanAccessCreatorTools } from '@/hooks/useCanAccessCreatorTools'
import { useCreatorAccess } from '@/hooks/useCreatorAccess'

import { getChainKey, LAUNCHPAD_MINTER_ABI, NFT_ABI, parsePublicMintReceipt } from '@/lib/blockchain'

import { formatPercentFromBps } from '@/lib/create-collection-validation'
import {
  formatPlatformMintFeePercent,
} from '@/lib/platform-fees'
import {
  collectionHasLegacyOnChainMintFee,
  resolveLaunchpadMinterAddress,
  resolveLaunchpadMintPaymentWei,
  shouldUseLaunchpadMinter,
} from '@/lib/launchpad-minter'
import { hasPlatformMintFeeExempt } from '@/lib/creator-access'

import { getPublicImageUrl } from '@/lib/supabase'

import type { Collection } from '@/types/database'
import { Erc1155PublicMintCard } from '@/components/Erc1155PublicMintCard'
import { getCollectionTokenStandard } from '@/lib/collection-contract'
import { GemShardsMintPanel } from '@/components/GemShardsMintPanel'
import {
  GEM_SHARDS_CARD_IMAGE,
  GEM_SHARDS_MINT_CARD_DESCRIPTION,
  isGemShardsContract,
} from '@/lib/gem-shards'

type PublicMintCardProps = {
  collection: Collection
}

function MintPanelSoldOutCard({
  collection,
  isGemShards,
}: {
  collection: Collection
  isGemShards: boolean
}) {
  const { data: tokens = [] } = useCollectionTokens(collection.id)
  const previewToken = tokens.find((token) => token.image_storage_path)
  const imageSrc = isGemShards
    ? GEM_SHARDS_CARD_IMAGE
    : previewToken?.image_storage_path
      ? getPublicImageUrl(previewToken.image_storage_path)
      : null
  const description = isGemShards
    ? GEM_SHARDS_MINT_CARD_DESCRIPTION
    : (collection.description || collection.symbol)

  return (
    <Card className="flex h-full flex-col overflow-hidden border-slate-800/80 bg-slate-950/40">
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={collection.name}
          className="aspect-square w-full object-cover opacity-60 grayscale"
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-slate-900/80 text-slate-500">
          {collection.symbol}
        </div>
      )}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <CardTitle>{collection.name}</CardTitle>
          <span className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-300">
            Minted out
          </span>
        </div>
        <CardDescription className="mt-2 line-clamp-3">{description}</CardDescription>
        {collection.contract_address && (
          <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
            <Link to={`/collection/${collection.contract_address}`}>View collection</Link>
          </Button>
        )}
      </div>
    </Card>
  )
}

function MintPanelCollectionCard({
  collection,
  onAvailabilityResolved,
}: {
  collection: Collection
  onAvailabilityResolved: (collectionId: string, isFullyMinted: boolean) => void
}) {
  const { data: platformConfig } = usePlatformConfig()
  const { isFullyMinted, isLoading } = useMintPanelAvailability(collection)
  const networkKey = getChainKey(collection.chain_id ?? 52014)
  const isGemShards = isGemShardsContract(collection.contract_address, networkKey, {
    gem_shards_mainnet: platformConfig?.gem_shards_mainnet,
    gem_shards_testnet: platformConfig?.gem_shards_testnet,
  })

  useEffect(() => {
    if (isLoading) return
    onAvailabilityResolved(collection.id, isFullyMinted)
  }, [collection.id, isFullyMinted, isLoading, onAvailabilityResolved])

  if (!isLoading && isFullyMinted) {
    return <MintPanelSoldOutCard collection={collection} isGemShards={isGemShards} />
  }

  if (isGemShards && collection.contract_address) {
    return (
      <GemShardsMintPanel
        variant="panel"
        collection={collection}
        contractAddress={collection.contract_address as `0x${string}`}
        chainId={collection.chain_id ?? 52014}
      />
    )
  }

  if (getCollectionTokenStandard(collection) === 'erc1155') {
    return <Erc1155PublicMintCard collection={collection} />
  }

  return <PublicMintCard collection={collection} />
}

export function PublicMintCard({ collection }: PublicMintCardProps) {

  const { address, isConnected } = useAccount()

  const { isAdmin } = useAdmin()
  const { holdings } = useCreatorAccess()
  const { data: platformConfig } = usePlatformConfig()
  const platformFeeExempt = hasPlatformMintFeeExempt(holdings)

  const { open } = useAppKit()

  const { chain } = useNetwork()

  const publicClient = usePublicClient({ chainId: collection.chain_id ?? chain.id })

  const { writeContractAsync } = useWriteContract()

  const { data: tokens = [] } = useCollectionTokens(collection.id)

  const [quantity, setQuantity] = useState(1)

  const [minting, setMinting] = useState(false)

  const [mintSuccessOpen, setMintSuccessOpen] = useState(false)

  const [mintedTokens, setMintedTokens] = useState<MintedTokenInfo[]>([])



  const contractAddress = collection.contract_address as `0x${string}` | undefined

  const targetChainId = collection.chain_id ?? chain.id
  const networkKey = getChainKey(targetChainId)
  const launchpadMinterAddress = resolveLaunchpadMinterAddress(networkKey, platformConfig)
  const useLaunchpadMinter = shouldUseLaunchpadMinter(collection, networkKey, platformConfig)

  const wrongNetwork = isConnected && chain.id !== targetChainId



  const { data: isMintable } = useReadContract({

    address: contractAddress,

    abi: NFT_ABI,

    functionName: 'isMintable',

    chainId: targetChainId,

    query: { enabled: Boolean(contractAddress) },

  })



  const { data: mintPriceWei } = useReadContract({

    address: contractAddress,

    abi: NFT_ABI,

    functionName: 'mintPrice',

    chainId: targetChainId,

    query: { enabled: Boolean(contractAddress) },

  })



  const {
    data: platformMintFeeBps,
    isError: platformMintFeeReadFailed,
    isLoading: platformMintFeeLoading,
  } = useReadContract({

    address: contractAddress,

    abi: NFT_ABI,

    functionName: 'platformMintFeeBps',

    chainId: targetChainId,

    query: { enabled: Boolean(contractAddress) },

  })



  const legacyOnChainMintFee = collectionHasLegacyOnChainMintFee(
    platformMintFeeBps,
    platformMintFeeReadFailed,
    collection,
  )
  const chargesLaunchpadMintFee = useLaunchpadMinter || legacyOnChainMintFee



  const { data: mintableForWallet } = useReadContract({

    address: contractAddress,

    abi: NFT_ABI,

    functionName: 'mintableCount',

    args: address ? [address] : undefined,

    chainId: targetChainId,

    query: { enabled: Boolean(contractAddress && address) },

  })



  const maxMintable = Number(mintableForWallet ?? 0)

  const safeQuantity = Math.min(quantity, Math.max(1, maxMintable || 1))



  const { data: requiredMintPaymentWei } = useReadContract({

    address: contractAddress,

    abi: NFT_ABI,

    functionName: 'requiredMintPayment',

    args: address ? [address, BigInt(safeQuantity)] : undefined,

    chainId: targetChainId,

    query: {
      enabled: Boolean(
        contractAddress && address && safeQuantity > 0 && legacyOnChainMintFee,
      ),
    },

  })

  const { data: launchpadRequiredMintPaymentWei } = useReadContract({
    address: launchpadMinterAddress ?? undefined,
    abi: LAUNCHPAD_MINTER_ABI,
    functionName: 'requiredMintPayment',
    args:
      contractAddress && address
        ? [contractAddress, address, BigInt(safeQuantity)]
        : undefined,
    chainId: targetChainId,
    query: {
      enabled: Boolean(
        useLaunchpadMinter &&
          launchpadMinterAddress &&
          contractAddress &&
          address &&
          safeQuantity > 0,
      ),
    },
  })



  const { data: totalMinted } = useReadContract({

    address: contractAddress,

    abi: NFT_ABI,

    functionName: 'totalMinted',

    chainId: targetChainId,

    query: { enabled: Boolean(contractAddress) },

  })



  const previewToken = tokens.find((token) => token.image_storage_path)

  const mintedCount = Number(totalMinted ?? 0)

  const remaining = Math.max(0, collection.max_supply - mintedCount)

  const priceEtn = collection.mint_price_etn

  const saleActive = Boolean(isMintable) && maxMintable > 0 && remaining > 0

  const baseMintWei = mintPriceWei ? mintPriceWei * BigInt(safeQuantity) : 0n
  const { totalMintWei, platformMintFeeWei } = resolveLaunchpadMintPaymentWei({
    baseMintWei,
    platformFeeExempt,
    usesLaunchpadMinter: useLaunchpadMinter,
    legacyOnChainMintFee,
    requiredMintPaymentWei: useLaunchpadMinter
      ? launchpadRequiredMintPaymentWei
      : requiredMintPaymentWei,
  })
  const showPlatformMintFee = chargesLaunchpadMintFee && platformMintFeeWei > 0n
  const mintPricingReady = Boolean(mintPriceWei) && !platformMintFeeLoading

  const isOwner = Boolean(

    address && collection.creator_wallet && address.toLowerCase() === collection.creator_wallet.toLowerCase(),

  )

  const canViewCollection = isAdmin || isOwner



  const mint = async () => {

    if (!address || !contractAddress || !publicClient) return

    if (!mintPricingReady || totalMintWei <= 0n) return

    if (safeQuantity < 1 || safeQuantity > maxMintable) {

      toast.error('Invalid mint quantity')

      return

    }



    const mintedBefore = mintedCount

    setMinting(true)

    try {

      let hash: `0x${string}`
      if (useLaunchpadMinter && launchpadMinterAddress) {
        hash = await writeContractAsync({
          address: launchpadMinterAddress,
          abi: LAUNCHPAD_MINTER_ABI,
          functionName: 'mintERC721',
          args: [contractAddress, BigInt(safeQuantity)],
          value: totalMintWei,
          chainId: targetChainId,
        })
      } else {
        hash = await writeContractAsync({
          address: contractAddress,
          abi: NFT_ABI,
          functionName: 'mint',
          args: [BigInt(safeQuantity)],
          value: totalMintWei,
          chainId: targetChainId,
        })
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      const assignments = parsePublicMintReceipt(

        receipt,

        contractAddress,

        mintedBefore,

        safeQuantity,

      )

      setMintedTokens(buildMintedTokenInfo(assignments, tokens))

      setMintSuccessOpen(true)

      toast.success(`Minted ${safeQuantity} NFT${safeQuantity === 1 ? '' : 's'} from ${collection.name}`)

      setQuantity(1)

    } catch (err) {

      toast.error(err instanceof Error ? err.message : 'Mint failed')

    } finally {

      setMinting(false)

    }

  }



  return (

    <>

      <MintSuccessModal

        open={mintSuccessOpen}

        onOpenChange={setMintSuccessOpen}

        collectionName={collection.name}

        contractAddress={contractAddress ?? ''}

        chainId={targetChainId}

        mintedTokens={mintedTokens}

      />

    <Card className="overflow-hidden">

      {previewToken?.image_storage_path && (

        <img

          src={getPublicImageUrl(previewToken.image_storage_path)}

          alt={collection.name}

          className="aspect-square w-full object-cover"

        />

      )}

      <div className="space-y-4 p-5">

        <div>

          <CardTitle>{collection.name}</CardTitle>

          {collection.mint_panel_admin_only && isAdmin && (
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-amber-300/90">
              Admin preview
            </p>
          )}

          <CardDescription className="mt-1">{collection.description || collection.symbol}</CardDescription>

        </div>



        <dl className="grid gap-2 text-sm">

          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Price</dt>
            <dd className="text-right">
              <div>{priceEtn} ETN each</div>
              <EtnUsdHint etn={priceEtn} align="right" className="mt-0.5" />
            </dd>
          </div>
          {showPlatformMintFee && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Platform fee ({formatPlatformMintFeePercent()})</dt>
              <dd className="text-right">
                <div>{Number(formatEther(platformMintFeeWei)).toLocaleString()} ETN</div>
                <EtnUsdHint etn={Number(formatEther(platformMintFeeWei))} align="right" className="mt-0.5" />
              </dd>
            </div>
          )}
          {showPlatformMintFee && (
            <div className="flex justify-between gap-3 border-t border-slate-800 pt-2">
              <dt className="text-slate-300">Total</dt>
              <dd className="text-right font-medium text-white">
                <div>{Number(formatEther(totalMintWei)).toLocaleString()} ETN</div>
                <EtnUsdHint etn={Number(formatEther(totalMintWei))} align="right" className="mt-0.5" />
              </dd>
            </div>
          )}

          <div className="flex justify-between gap-3">

            <dt className="text-slate-400">Minted</dt>

            <dd>

              {mintedCount} / {collection.max_supply}

            </dd>

          </div>

          {Number(collection.max_mint_per_wallet) > 0 && (

            <div className="flex justify-between gap-3">

              <dt className="text-slate-400">Wallet limit</dt>

              <dd>{collection.max_mint_per_wallet}</dd>

            </div>

          )}

        </dl>



        {collection.burn_on_mint && Number(collection.mint_burn_bps ?? 0) > 0 && (

          <p className="text-xs text-amber-300/90">

            {formatPercentFromBps(collection.mint_burn_bps)} of each mint is swapped to CLUB and burned.

          </p>

        )}



        {!isConnected ? (

          <Button className="w-full" onClick={() => open({ view: 'Connect' })}>

            Connect wallet to mint

          </Button>

        ) : wrongNetwork ? (

          <p className="text-sm text-amber-300">

            Switch to {targetChainId === 5201420 ? 'Electroneum Testnet' : 'Electroneum Mainnet'} to mint.

          </p>

        ) : !saleActive ? (

          <p className="text-sm text-slate-400">Public mint is not active for this collection right now.</p>

        ) : (

          <div className="space-y-3">

            <div>

              <Label htmlFor={`mint-qty-${collection.id}`}>Quantity</Label>

              <Input

                id={`mint-qty-${collection.id}`}

                type="number"

                min={1}

                max={maxMintable}

                value={safeQuantity}

                onChange={(e) => setQuantity(Math.max(1, Math.min(maxMintable, Number(e.target.value) || 1)))}

              />

              <p className="mt-1 text-xs text-slate-500">You can mint up to {maxMintable} more.</p>

            </div>

            <Button className="w-full" disabled={minting || !mintPricingReady} onClick={mint}>

              {minting

                ? 'Minting…'

                : `Mint ${safeQuantity} for ${Number(formatEther(totalMintWei)).toLocaleString()} ETN`}

            </Button>

          </div>

        )}



        {canViewCollection && (

          <Button variant="outline" size="sm" className="w-full" asChild>

            <Link to={`/collection/${collection.contract_address}`}>View collection</Link>

          </Button>

        )}

      </div>

    </Card>

    </>

  )

}



export function NftMintingPanel() {

  const { chain } = useNetwork()

  const { isAdmin } = useAdmin()

  const { canAccessCreatorTools } = useCanAccessCreatorTools()

  const { data: collections = [], isLoading } = useMintPanelCollections(chain.id, isAdmin)
  const [mintedOutById, setMintedOutById] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setMintedOutById({})
  }, [collections])

  const handleAvailabilityResolved = useCallback((collectionId: string, isFullyMinted: boolean) => {
    setMintedOutById((prev) => {
      if (prev[collectionId] === isFullyMinted) return prev
      return { ...prev, [collectionId]: isFullyMinted }
    })
  }, [])

  const sortedCollections = [...collections].sort((left, right) => {
    const leftMintedOut = mintedOutById[left.id] ?? false
    const rightMintedOut = mintedOutById[right.id] ?? false
    if (leftMintedOut === rightMintedOut) return 0
    return leftMintedOut ? 1 : -1
  })

  return (

    <section className="space-y-4">

      <div>

        <h2 className="text-xl font-semibold sm:text-2xl">NFT Minting Panel</h2>

        <p className="mt-1 text-slate-400">

          Mint live collections on {chain.name}. Creators opt in from their collection settings.

        </p>

      </div>



      {isLoading ? (

        <p className="text-slate-400">Loading mintable collections…</p>

      ) : collections.length === 0 ? (

        <Card className="p-6">

          <CardTitle>No collections on the minting panel yet</CardTitle>

          <CardDescription className="mt-2">

            Publish a collection with public mint enabled, then turn on “Show on NFT Minting Panel” when creating your collection.

          </CardDescription>

          {canAccessCreatorTools && (

            <Button className="mt-4" asChild>

              <Link to="/create">Create a collection</Link>

            </Button>

          )}

        </Card>

      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedCollections.map((collection) => (
            <MintPanelCollectionCard
              key={collection.id}
              collection={collection}
              onAvailabilityResolved={handleAvailabilityResolved}
            />
          ))}
        </div>
      )}

    </section>

  )

}


