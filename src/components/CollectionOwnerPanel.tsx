import { useAccount, useBalance, useReadContract, useWriteContract } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CardDescription, CardTitle } from '@/components/ui/card'
import { NFT_ABI } from '@/lib/blockchain'
import { syncTokenUri, updateToken } from '@/lib/api'
import { getOnChainTokenUriSuffix } from '@/lib/collection-metadata'
import { formatPercentDisplay } from '@/lib/create-collection-validation'
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

  const { data: royaltyInfo } = useReadContract({
    address: contractAddress,
    abi: NFT_ABI,
    functionName: 'royaltyInfo',
    args: [1n, parseEther('100')],
    chainId,
    query: { enabled: Boolean(contractAddress) },
  })

  const { data: burnConfigOnChain } = useReadContract({
    address: contractAddress,
    abi: NFT_ABI,
    functionName: 'burnConfig',
    chainId,
    query: { enabled: Boolean(contractAddress) },
  })

  const { data: balance, refetch: refetchBalance } = useBalance({
    address: contractAddress,
    chainId,
    query: { enabled: Boolean(contractAddress) },
  })

  const [ownerMinting, setOwnerMinting] = useState(false)

  if (!contractAddress) return null

  const isOwner = owner && address && owner.toLowerCase() === address.toLowerCase()
  if (!isOwner) return null

  const mintedOnChain = totalMinted !== undefined ? Number(totalMinted) : null
  const nextOnChainTokenId = mintedOnChain != null ? mintedOnChain + 1 : null
  const nextDbToken = tokens.find((token) => token.token_id === nextOnChainTokenId && !token.minted)

  const royaltyPercent =
    royaltyInfo?.[1] !== undefined
      ? formatPercentDisplay(String(Number((royaltyInfo[1] * 10_000n) / parseEther('100')) / 100))
      : '…'

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

  const withdraw = async () => {
    try {
      await writeContractAsync({
        address: contractAddress,
        abi: NFT_ABI,
        functionName: 'withdraw',
        chainId,
      })
      refetchBalance()
      toast.success('ETN withdrawn to your wallet')
      onUpdated?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Withdraw failed')
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-5">
      <div>
        <CardTitle className="text-base">Contract owner</CardTitle>
        <CardDescription className="mt-1">
          On-chain status for your published collection. Configure royalties, mint settings, and metadata before
          publishing — they cannot be changed here after deploy.
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
        <div>
          <dt className="text-slate-500">Marketplace royalty</dt>
          <dd className="font-medium text-white">{royaltyPercent}%</dd>
        </div>
        <div>
          <dt className="text-slate-500">Royalties CLUB burn</dt>
          <dd className="font-medium text-white">
            {burnConfigOnChain?.[2] !== undefined ? `${Number(burnConfigOnChain[2]) / 100}%` : '…'}
          </dd>
        </div>
      </dl>

      {collection.mint_mode === 'lazy' && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-200">Owner minting</h3>
          <p className="text-xs text-slate-500">
            Mints the next sequential token to your wallet. No paid sale fee applies.
          </p>
          {nextOnChainTokenId != null && nextOnChainTokenId <= collection.max_supply ? (
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
                    : `Token #${nextOnChainTokenId} metadata not ready`}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">All tokens minted on-chain.</p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-200">Withdraw royalties</h3>
        <p className="text-xs text-slate-500">
          Sends accumulated ETN from the contract to your wallet.
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
    </div>
  )
}
