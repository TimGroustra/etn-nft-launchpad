import { useAccount, useBalance, useReadContract, useWriteContract } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CardDescription, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { NFT_ABI } from '@/lib/blockchain'
import { syncTokenUri, updateCollection, updateToken } from '@/lib/api'
import { getOnChainTokenUriSuffix } from '@/lib/collection-metadata'
import { useCollectionTokens } from '@/hooks/useCollections'
import type { Collection } from '@/types/database'

interface CollectionOwnerPanelProps {
  collection: Collection
  chainId: number
  onUpdated?: () => void
}

export function CollectionOwnerPanel({ collection, chainId, onUpdated }: CollectionOwnerPanelProps) {
  const contractAddress = collection.contract_address as `0x${string}` | undefined
  const { address } = useAccount()
  const { writeContractAsync, isPending } = useWriteContract()
  const { data: tokens = [] } = useCollectionTokens(collection.id)

  const { data: owner } = useReadContract({
    address: contractAddress,
    abi: NFT_ABI,
    functionName: 'owner',
    chainId,
    query: { enabled: Boolean(contractAddress) },
  })

  const { data: totalMinted } = useReadContract({
    address: contractAddress,
    abi: NFT_ABI,
    functionName: 'totalMinted',
    chainId,
    query: { enabled: Boolean(contractAddress) },
  })

  const { data: isMintableOnChain } = useReadContract({
    address: contractAddress,
    abi: NFT_ABI,
    functionName: 'isMintable',
    chainId,
    query: { enabled: Boolean(contractAddress) },
  })

  const { data: mintPriceWei } = useReadContract({
    address: contractAddress,
    abi: NFT_ABI,
    functionName: 'mintPrice',
    chainId,
    query: { enabled: Boolean(contractAddress) },
  })

  const { data: maxMintPerWalletOnChain } = useReadContract({
    address: contractAddress,
    abi: NFT_ABI,
    functionName: 'maxMintPerWallet',
    chainId,
    query: { enabled: Boolean(contractAddress) },
  })

  const { data: balance, refetch: refetchBalance } = useBalance({
    address: contractAddress,
    chainId,
    query: { enabled: Boolean(contractAddress) },
  })

  const [mintPriceEtn, setMintPriceEtn] = useState('')
  const [maxPerWallet, setMaxPerWallet] = useState('')
  const [ownerMinting, setOwnerMinting] = useState(false)

  useEffect(() => {
    if (mintPriceWei !== undefined) {
      setMintPriceEtn(formatEther(mintPriceWei))
    }
  }, [mintPriceWei])

  useEffect(() => {
    if (maxMintPerWalletOnChain !== undefined) {
      setMaxPerWallet(maxMintPerWalletOnChain.toString())
    }
  }, [maxMintPerWalletOnChain])

  if (!contractAddress) return null

  const isOwner = owner && address && owner.toLowerCase() === address.toLowerCase()
  if (!isOwner) return null

  const unmintedCount = tokens.filter((t) => !t.minted).length
  const mintedOnChain = totalMinted !== undefined ? Number(totalMinted) : null
  const nextOnChainTokenId = mintedOnChain != null ? mintedOnChain + 1 : null
  const nextDbToken = tokens.find((token) => token.token_id === nextOnChainTokenId && !token.minted)

  const runContract = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
      toast.success(label)
      onUpdated?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${label} failed`)
    }
  }

  const togglePublicMint = () =>
    runContract(isMintableOnChain ? 'Public mint disabled' : 'Public mint enabled', () =>
      writeContractAsync({
        address: contractAddress,
        abi: NFT_ABI,
        functionName: 'setMintable',
        args: [!isMintableOnChain],
        chainId,
      }),
    )

  const applyMintPrice = () =>
    runContract('Mint price updated on-chain', async () => {
      await writeContractAsync({
        address: contractAddress,
        abi: NFT_ABI,
        functionName: 'setMintPrice',
        args: [parseEther(mintPriceEtn || '0')],
        chainId,
      })
      if (address) {
        await updateCollection(address, collection.id, {
          mintPriceEtn: Number(mintPriceEtn) || 0,
        })
      }
    })

  const applyMaxPerWallet = () =>
    runContract('Max mint per wallet updated on-chain', async () => {
      const value = BigInt(maxPerWallet || '0')
      await writeContractAsync({
        address: contractAddress,
        abi: NFT_ABI,
        functionName: 'setMaxMintPerWallet',
        args: [value],
        chainId,
      })
      if (address) {
        await updateCollection(address, collection.id, {
          maxMintPerWallet: Number(value),
        })
      }
    })

  const withdraw = () =>
    runContract('ETN withdrawn to your wallet', async () => {
      await writeContractAsync({
        address: contractAddress,
        abi: NFT_ABI,
        functionName: 'withdraw',
        chainId,
      })
      refetchBalance()
    })

  const fixTokenUri = (tokenId: number) =>
    runContract(`Token #${tokenId} URI fixed on-chain`, () =>
      writeContractAsync({
        address: contractAddress,
        abi: NFT_ABI,
        functionName: 'setTokenURI',
        args: [BigInt(tokenId), `${tokenId}.json`],
        chainId,
      }),
    )

  const ownerMintNext = async () => {
    if (!address || nextOnChainTokenId == null || !nextDbToken?.token_id) {
      toast.error('No more tokens ready to owner mint.')
      return
    }

    setOwnerMinting(true)
    try {
      await syncTokenUri(address, collection.id, nextOnChainTokenId)
      const onChainUri = getOnChainTokenUriSuffix(nextOnChainTokenId)
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: NFT_ABI,
        functionName: 'ownerMint',
        args: [address, onChainUri],
        chainId,
      })
      await updateToken(address, { tokenId: nextDbToken.id, minted: true, mintTxHash: hash })
      toast.success(`Minted #${nextOnChainTokenId} to your wallet`)
      onUpdated?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Owner mint failed')
    } finally {
      setOwnerMinting(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-5">
      <div>
        <CardTitle className="text-base">Contract owner controls</CardTitle>
        <CardDescription className="mt-1">
          On-chain functions on your published EditableERC721 contract.
        </CardDescription>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-slate-500">Minted on-chain</dt>
          <dd className="font-medium text-white">
            {mintedOnChain ?? '…'} / {collection.max_supply}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Public mint</dt>
          <dd className="font-medium text-white">{isMintableOnChain ? 'Active' : 'Off'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Mint price</dt>
          <dd className="font-medium text-white">
            {mintPriceWei !== undefined ? `${formatEther(mintPriceWei)} ETN` : '…'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Max per wallet</dt>
          <dd className="font-medium text-white">
            {maxMintPerWalletOnChain === 0n ? 'Unlimited' : maxMintPerWalletOnChain?.toString() ?? '…'}
          </dd>
        </div>
      </dl>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-200">Owner minting (lazy mode)</h3>
        <p className="text-xs text-slate-500">
          Mints the next sequential token to your wallet with matching metadata. No public mint fee applies.
        </p>
        {collection.mint_mode === 'lazy' ? (
          nextOnChainTokenId != null && nextOnChainTokenId <= collection.max_supply ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={ownerMintNext}
                disabled={ownerMinting || isPending || !nextDbToken}
              >
                {ownerMinting
                  ? 'Minting…'
                  : nextDbToken
                    ? `Owner mint #${nextOnChainTokenId}`
                    : `Prepare token #${nextOnChainTokenId} metadata first`}
              </Button>
              <span className="text-xs text-slate-500">{unmintedCount} unminted in database</span>
            </div>
          ) : (
            <p className="text-xs text-slate-500">All tokens minted on-chain.</p>
          )
        ) : (
          <p className="text-xs text-slate-500">Not applicable — this collection mints all tokens at publish.</p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">Public mint (IMintable)</h3>
        <p className="text-xs text-slate-500">
          <code className="text-slate-400">setMintable</code>, <code className="text-slate-400">setMintPrice</code>, and{' '}
          <code className="text-slate-400">setMaxMintPerWallet</code> control marketplace minting.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={togglePublicMint} disabled={isPending}>
            {isMintableOnChain ? 'Disable public mint' : 'Enable public mint'}
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`mint-price-${collection.id}`}>Mint price (ETN)</Label>
            <div className="flex gap-2">
              <Input
                id={`mint-price-${collection.id}`}
                type="number"
                min="0"
                step="any"
                value={mintPriceEtn}
                onChange={(e) => setMintPriceEtn(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={applyMintPrice} disabled={isPending}>
                Apply
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`max-wallet-${collection.id}`}>Max mint per wallet (0 = unlimited)</Label>
            <div className="flex gap-2">
              <Input
                id={`max-wallet-${collection.id}`}
                type="number"
                min="0"
                step="1"
                value={maxPerWallet}
                onChange={(e) => setMaxPerWallet(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={applyMaxPerWallet} disabled={isPending}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-200">Withdraw royalties</h3>
        <p className="text-xs text-slate-500">
          <code className="text-slate-400">withdraw</code> sends accumulated ETN from the contract to your wallet.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">
            Contract balance: {balance ? formatEther(balance.value) : '0'} ETN
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={withdraw}
            disabled={isPending || !balance || balance.value === 0n}
          >
            Withdraw ETN
          </Button>
        </div>
      </section>

      {mintedOnChain != null && mintedOnChain > 0 && (
        <section className="space-y-2 border-t border-slate-800 pt-3">
          <h3 className="text-sm font-semibold text-slate-200">Repair token metadata</h3>
          <p className="text-xs text-slate-500">
            If a wallet shows a broken image, reset the on-chain URI to the relative suffix (e.g.{' '}
            <code className="text-slate-400">1.json</code>) so baseURI resolves correctly.
          </p>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: mintedOnChain }, (_, i) => i + 1).map((tokenId) => (
              <Button
                key={tokenId}
                size="sm"
                variant="outline"
                onClick={() => fixTokenUri(tokenId)}
                disabled={isPending}
              >
                Fix #{tokenId} URI
              </Button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-1 border-t border-slate-800 pt-3">
        <h3 className="text-sm font-semibold text-slate-200">Also available via Edit / Update</h3>
        <p className="text-xs text-slate-500">
          <code className="text-slate-400">setBaseURI</code>, <code className="text-slate-400">setTokenURI</code>,{' '}
          <code className="text-slate-400">batchSetTokenURI</code>, and <code className="text-slate-400">setBurnConfig</code>{' '}
          are applied when you edit metadata and click Update on this dashboard.
        </p>
      </section>
    </div>
  )
}
