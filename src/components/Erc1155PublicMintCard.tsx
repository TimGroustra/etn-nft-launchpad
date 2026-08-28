import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from 'wagmi'
import { formatEther } from 'viem'
import { useAppKit } from '@reown/appkit/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { MintSuccessModal, type MintedTokenInfo } from '@/components/MintSuccessModal'
import { EtnUsdHint } from '@/components/EtnUsdHint'
import { useCollectionTokens } from '@/hooks/useCollections'
import { usePlatformConfig } from '@/hooks/usePlatformConfig'
import { useNetwork } from '@/context/NetworkContext'
import { useAdmin } from '@/hooks/useAdmin'
import { useCreatorAccess } from '@/hooks/useCreatorAccess'
import {
  formatPlatformMintFeePercent,
} from '@/lib/platform-fees'
import { hasPlatformMintFeeExempt } from '@/lib/creator-access'
import { getCollectionContractAbi, getChainKey, LAUNCHPAD_MINTER_ABI } from '@/lib/blockchain'
import {
  collectionHasLegacyOnChainMintFee,
  resolveLaunchpadMinterAddress,
  resolveLaunchpadMintPaymentWei,
  shouldUseLaunchpadMinter,
} from '@/lib/launchpad-minter'
import {
  buildErc1155TypeAvailability,
  formatErc1155SupplyLabel,
  sumEditionRemaining,
  useErc1155PerTypeMintSupported,
} from '@/lib/erc1155-mint'
import { getPublicImageUrl } from '@/lib/supabase'
import type { Collection } from '@/types/database'

type Erc1155PublicMintCardProps = {
  collection: Collection
}

export function Erc1155PublicMintCard({ collection }: Erc1155PublicMintCardProps) {
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

  const contractAddress = collection.contract_address as `0x${string}` | undefined
  const targetChainId = collection.chain_id ?? chain.id
  const networkKey = getChainKey(targetChainId)
  const launchpadMinterAddress = resolveLaunchpadMinterAddress(networkKey, platformConfig)
  const useLaunchpadMinter = shouldUseLaunchpadMinter(collection, networkKey, platformConfig)
  const wrongNetwork = isConnected && chain.id !== targetChainId
  const contractAbi = getCollectionContractAbi(collection)

  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [mintingTypeId, setMintingTypeId] = useState<number | null>(null)
  const [mintSuccessOpen, setMintSuccessOpen] = useState(false)
  const [mintedTokens, setMintedTokens] = useState<MintedTokenInfo[]>([])

  const { data: isMintable } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'isMintable',
    chainId: targetChainId,
    query: { enabled: Boolean(contractAddress) },
  })

  const { data: mintPriceWei } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
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
    abi: contractAbi,
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

  const { data: supportsMintEdition, isLoading: mintEditionProbeLoading } = useErc1155PerTypeMintSupported(
    publicClient,
    contractAddress,
  )
  const perTypeMintSupported = supportsMintEdition === true

  const { data: walletMintCount } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'mintableCount',
    args: address ? [address] : undefined,
    chainId: targetChainId,
    query: { enabled: Boolean(contractAddress && address && supportsMintEdition === false) },
  })

  const editionReads = useReadContracts({
    contracts: tokens
      .filter((token) => token.token_id != null)
      .flatMap((token) => [
        {
          address: contractAddress!,
          abi: contractAbi,
          functionName: 'editionCap' as const,
          args: [BigInt(token.token_id!)],
          chainId: targetChainId,
        },
        {
          address: contractAddress!,
          abi: contractAbi,
          functionName: 'editionMinted' as const,
          args: [BigInt(token.token_id!)],
          chainId: targetChainId,
        },
      ]),
    query: { enabled: Boolean(contractAddress && tokens.length > 0) },
  })

  const typeAvailability = useMemo(() => {
    const caps = new Map<number, bigint>()
    const minted = new Map<number, bigint>()
    const sorted = tokens.filter((t) => t.token_id != null).sort((a, b) => (a.token_id ?? 0) - (b.token_id ?? 0))
    sorted.forEach((token, index) => {
      const tokenId = token.token_id!
      const capResult = editionReads.data?.[index * 2]?.result
      const mintedResult = editionReads.data?.[index * 2 + 1]?.result
      if (typeof capResult === 'bigint') caps.set(tokenId, capResult)
      if (typeof mintedResult === 'bigint') minted.set(tokenId, mintedResult)
    })
    return buildErc1155TypeAvailability(tokens, caps, minted)
  }, [editionReads.data, tokens])

  const totalRemaining = sumEditionRemaining(typeAvailability)
  const anyListed = typeAvailability.some((type) => type.isListed)
  const priceEtn = collection.mint_price_etn
  const saleActive = Boolean(isMintable) && Boolean(mintPriceWei) && totalRemaining > 0
  const mintPricingReady = Boolean(mintPriceWei) && !platformMintFeeLoading

  const isOwner = Boolean(
    address && collection.creator_wallet && address.toLowerCase() === collection.creator_wallet.toLowerCase(),
  )
  const canViewCollection = isAdmin || isOwner

  const getQuantity = (tokenId: number) => Math.max(1, quantities[tokenId] ?? 1)

  const setQuantity = (tokenId: number, value: number) => {
    setQuantities((prev) => ({ ...prev, [tokenId]: value }))
  }

  const resolvePayment = (quantity: number) => {
    const baseMintWei = mintPriceWei ? mintPriceWei * BigInt(quantity) : 0n
    return resolveLaunchpadMintPaymentWei({
      baseMintWei,
      platformFeeExempt,
      usesLaunchpadMinter: useLaunchpadMinter,
      legacyOnChainMintFee,
    })
  }

  const mintEditionType = async (type: (typeof typeAvailability)[number]) => {
    if (!address || !contractAddress || !publicClient || !perTypeMintSupported) return
    const quantity = getQuantity(type.tokenId)
    if (quantity < 1 || quantity > type.remaining) {
      toast.error('Invalid quantity for this type')
      return
    }

    const { totalMintWei } = resolvePayment(quantity)
    if (!mintPricingReady || totalMintWei <= 0n) return

    setMintingTypeId(type.tokenId)
    try {
      let hash: `0x${string}`
      if (useLaunchpadMinter && launchpadMinterAddress) {
        hash = await writeContractAsync({
          address: launchpadMinterAddress,
          abi: LAUNCHPAD_MINTER_ABI,
          functionName: 'mintEdition',
          args: [contractAddress, BigInt(type.tokenId), BigInt(quantity)],
          value: totalMintWei,
          chainId: targetChainId,
        })
      } else {
        hash = await writeContractAsync({
          address: contractAddress,
          abi: contractAbi,
          functionName: 'mintEdition',
          args: [BigInt(type.tokenId), BigInt(quantity)],
          value: totalMintWei,
          chainId: targetChainId,
        })
      }
      await publicClient.waitForTransactionReceipt({ hash })
      setMintedTokens([
        {
          tokenId: type.tokenId,
          name: type.name,
          imageUrl: type.imagePath ? getPublicImageUrl(type.imagePath) : null,
          amount: quantity,
        },
      ])
      setMintSuccessOpen(true)
      setQuantity(type.tokenId, 1)
      toast.success(`Minted ${quantity} × ${type.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mint failed')
    } finally {
      setMintingTypeId(null)
    }
  }

  const mintSequentialLegacy = async () => {
    if (!address || !contractAddress || !publicClient || perTypeMintSupported) return
    const quantity = getQuantity(typeAvailability[0]?.tokenId ?? 1)
    const maxMintable = Number(walletMintCount ?? 0)
    if (quantity < 1 || quantity > maxMintable) {
      toast.error('Invalid mint quantity')
      return
    }
    const { totalMintWei } = resolvePayment(quantity)
    if (!mintPricingReady || totalMintWei <= 0n) return

    setMintingTypeId(-1)
    try {
      let hash: `0x${string}`
      if (useLaunchpadMinter && launchpadMinterAddress) {
        hash = await writeContractAsync({
          address: launchpadMinterAddress,
          abi: LAUNCHPAD_MINTER_ABI,
          functionName: 'mintERC721',
          args: [contractAddress, BigInt(quantity)],
          value: totalMintWei,
          chainId: targetChainId,
        })
      } else {
        hash = await writeContractAsync({
          address: contractAddress,
          abi: contractAbi,
          functionName: 'mint',
          args: [BigInt(quantity)],
          value: totalMintWei,
          chainId: targetChainId,
        })
      }
      await publicClient.waitForTransactionReceipt({ hash })
      const minted = typeAvailability.slice(0, quantity).map((type) => ({
        tokenId: type.tokenId,
        name: type.name,
        imageUrl: type.imagePath ? getPublicImageUrl(type.imagePath) : null,
        amount: 1,
      }))
      setMintedTokens(minted)
      setMintSuccessOpen(true)
      toast.success(`Minted ${quantity} type(s) in order from ${collection.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mint failed')
    } finally {
      setMintingTypeId(null)
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

      <Card className="overflow-hidden sm:col-span-2 lg:col-span-3">
        <div className="space-y-4 p-5">
          <div>
            <CardTitle>{collection.name}</CardTitle>
            {collection.mint_panel_admin_only && isAdmin && (
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-amber-300/90">Admin preview</p>
            )}
            <CardDescription className="mt-1">
              {collection.description || collection.symbol} · {formatErc1155SupplyLabel(tokens)}
            </CardDescription>
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-slate-400">Price</dt>
              <dd>
                <div>{priceEtn} ETN each</div>
                <EtnUsdHint etn={priceEtn} className="mt-0.5" />
              </dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-slate-400">Available</dt>
              <dd>
                {anyListed ? `${totalRemaining} copies across ${typeAvailability.length} types` : 'Caps not set on-chain'}
              </dd>
            </div>
            {Number(collection.max_mint_per_wallet) > 0 && (
              <div className="flex justify-between gap-3 sm:block">
                <dt className="text-slate-400">Wallet limit</dt>
                <dd>{collection.max_mint_per_wallet} copies total</dd>
              </div>
            )}
          </dl>

          {supportsMintEdition === false && (
            <p className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200/90">
              This collection was deployed from an ERC-1155 factory that predates per-type minting. The on-chain
              contract has edition caps but no <code className="text-amber-100">mintEdition</code> function, so buyers
              can only mint types sequentially (one copy per type, in order). Create a new collection after the
              launchpad ERC-1155 factory is upgraded — redeploying the same collection address is not possible.
            </p>
          )}

          {!anyListed && isOwner && (
            <p className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
              Edition caps are not set on-chain yet (reading as 0). Open your dashboard, expand this collection, and
              click <strong>Sync edition caps</strong> before public minting can work.
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
          ) : mintEditionProbeLoading ? (
            <p className="text-sm text-slate-400">Checking contract mint capabilities…</p>
          ) : perTypeMintSupported ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {typeAvailability.map((type) => {
                const quantity = getQuantity(type.tokenId)
                const { totalMintWei, platformMintFeeWei } = resolvePayment(quantity)
                const showFee = chargesLaunchpadMintFee && platformMintFeeWei > 0n
                const disabled = !type.isListed || type.remaining <= 0 || mintingTypeId !== null

                return (
                  <div
                    key={type.tokenId}
                    className="flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50"
                  >
                    {type.imagePath ? (
                      <img
                        src={getPublicImageUrl(type.imagePath)}
                        alt={type.name}
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center bg-slate-900 text-slate-500">
                        Type #{type.tokenId}
                      </div>
                    )}
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div>
                        <p className="font-medium text-white">{type.name}</p>
                        <p className="text-xs text-slate-400">Type #{type.tokenId}</p>
                      </div>
                      <p className="text-sm text-slate-300">
                        {type.isListed ? (
                          <>
                            <span className="font-medium text-white">{type.remaining}</span> of {type.onChainCap}{' '}
                            remaining
                          </>
                        ) : (
                          <span className="text-amber-300/90">Not listed on-chain (cap is 0)</span>
                        )}
                      </p>
                      <div>
                        <Label htmlFor={`mint-qty-${collection.id}-${type.tokenId}`}>Quantity</Label>
                        <Input
                          id={`mint-qty-${collection.id}-${type.tokenId}`}
                          type="number"
                          min={1}
                          max={Math.max(1, type.remaining)}
                          value={Math.min(quantity, Math.max(1, type.remaining))}
                          disabled={disabled}
                          onChange={(e) =>
                            setQuantity(
                              type.tokenId,
                              Math.max(1, Math.min(type.remaining, Number(e.target.value) || 1)),
                            )
                          }
                        />
                      </div>
                      <Button
                        className="mt-auto w-full"
                        disabled={disabled || !mintPricingReady}
                        onClick={() => void mintEditionType(type)}
                      >
                        {mintingTypeId === type.tokenId
                          ? 'Minting…'
                          : `Mint for ${Number(formatEther(totalMintWei)).toLocaleString()} ETN`}
                      </Button>
                      {showFee && (
                        <p className="text-center text-xs text-slate-500">
                          Includes {formatPlatformMintFeePercent()} platform fee
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">
                Legacy mint assigns types in order: {typeAvailability.map((t) => t.name).join(' → ')}.
              </p>
              <div>
                <Label htmlFor={`mint-qty-legacy-${collection.id}`}>Quantity (types in order)</Label>
                <Input
                  id={`mint-qty-legacy-${collection.id}`}
                  type="number"
                  min={1}
                  max={Number(walletMintCount ?? 1)}
                  value={getQuantity(typeAvailability[0]?.tokenId ?? 1)}
                  onChange={(e) => {
                    const next = Math.max(1, Math.min(Number(walletMintCount ?? 1), Number(e.target.value) || 1))
                    const updated: Record<number, number> = {}
                    typeAvailability.forEach((type) => {
                      updated[type.tokenId] = next
                    })
                    setQuantities(updated)
                  }}
                />
              </div>
              <Button
                className="w-full"
                disabled={mintingTypeId !== null || !mintPricingReady}
                onClick={() => void mintSequentialLegacy()}
              >
                {mintingTypeId === -1 ? 'Minting…' : 'Mint next type(s)'}
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
