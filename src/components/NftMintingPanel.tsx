import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useCollectionTokens, useMintPanelCollections } from '@/hooks/useCollections'
import { useNetwork } from '@/context/NetworkContext'
import { NFT_ABI } from '@/lib/blockchain'
import { formatPercentFromBps } from '@/lib/create-collection-validation'
import { getPublicImageUrl } from '@/lib/supabase'
import type { Collection } from '@/types/database'

type PublicMintCardProps = {
  collection: Collection
}

export function PublicMintCard({ collection }: PublicMintCardProps) {
  const { address, isConnected } = useAccount()
  const { open } = useAppKit()
  const { chain } = useNetwork()
  const { writeContractAsync } = useWriteContract()
  const { data: tokens = [] } = useCollectionTokens(collection.id)
  const [quantity, setQuantity] = useState(1)
  const [minting, setMinting] = useState(false)

  const contractAddress = collection.contract_address as `0x${string}` | undefined
  const targetChainId = collection.chain_id ?? chain.id
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

  const { data: mintableForWallet } = useReadContract({
    address: contractAddress,
    abi: NFT_ABI,
    functionName: 'mintableCount',
    args: address ? [address] : undefined,
    chainId: targetChainId,
    query: { enabled: Boolean(contractAddress && address) },
  })

  const { data: totalMinted } = useReadContract({
    address: contractAddress,
    abi: NFT_ABI,
    functionName: 'totalMinted',
    chainId: targetChainId,
    query: { enabled: Boolean(contractAddress) },
  })

  const previewToken = tokens.find((token) => token.image_storage_path)
  const maxMintable = Number(mintableForWallet ?? 0)
  const mintedCount = Number(totalMinted ?? 0)
  const remaining = Math.max(0, collection.max_supply - mintedCount)
  const priceEtn = collection.mint_price_etn
  const saleActive = Boolean(isMintable) && maxMintable > 0 && remaining > 0
  const safeQuantity = Math.min(quantity, Math.max(1, maxMintable || 1))

  const mint = async () => {
    if (!address || !contractAddress || !mintPriceWei) return
    if (safeQuantity < 1 || safeQuantity > maxMintable) {
      toast.error('Invalid mint quantity')
      return
    }

    setMinting(true)
    try {
      await writeContractAsync({
        address: contractAddress,
        abi: NFT_ABI,
        functionName: 'mint',
        args: [BigInt(safeQuantity)],
        value: mintPriceWei * BigInt(safeQuantity),
        chainId: targetChainId,
      })
      toast.success(`Minted ${safeQuantity} NFT${safeQuantity === 1 ? '' : 's'} from ${collection.name}`)
      setQuantity(1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mint failed')
    } finally {
      setMinting(false)
    }
  }

  return (
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
          <CardDescription className="mt-1">{collection.description || collection.symbol}</CardDescription>
        </div>

        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Price</dt>
            <dd>{priceEtn} ETN</dd>
          </div>
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
          <Button className="w-full" onClick={() => open()}>
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
            <Button className="w-full" disabled={minting} onClick={mint}>
              {minting
                ? 'Minting…'
                : `Mint ${safeQuantity} for ${(Number(priceEtn) * safeQuantity).toLocaleString()} ETN`}
            </Button>
          </div>
        )}

        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link to={`/collection/${collection.contract_address}`}>View collection</Link>
        </Button>
      </div>
    </Card>
  )
}

export function NftMintingPanel() {
  const { chain } = useNetwork()
  const { data: collections = [], isLoading } = useMintPanelCollections(chain.id)

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">NFT Minting Panel</h2>
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
            Publish a collection with public mint enabled, then turn on “Show on NFT Minting Panel” in create or edit.
          </CardDescription>
          <Button className="mt-4" asChild>
            <Link to="/create">Create a collection</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <PublicMintCard key={collection.id} collection={collection} />
          ))}
        </div>
      )}
    </section>
  )
}
