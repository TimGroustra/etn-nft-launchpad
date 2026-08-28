import { useAccount, useBalance, useReadContract } from 'wagmi'
import { formatEther, getAddress, isAddress, parseEther } from 'viem'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CardDescription, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { getCollectionContractAbi, NFT_ABI } from '@/lib/blockchain'
import { syncTokenUri, updateToken } from '@/lib/api'
import { getOnChainTokenUriSuffix } from '@/lib/collection-metadata'
import { getCollectionTokenStandard } from '@/lib/collection-contract'
import { configureErc1155EditionCaps } from '@/lib/publish-collection'
import { formatPercentDisplay } from '@/lib/create-collection-validation'
import { useCollectionTokens } from '@/hooks/useCollections'
import { useChainWriteContract } from '@/hooks/useChainWriteContract'
import type { Collection, CollectionToken } from '@/types/database'

const SET_EDITION_CAP_ABI = [
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'cap', type: 'uint256' },
    ],
    name: 'setEditionCap',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

function isTokenMetadataReady(token: CollectionToken): boolean {
  return Boolean(token.token_id != null && token.name.trim() && token.image_storage_path)
}

const selectClassName =
  'flex h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1 text-sm text-white shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-500'

interface CollectionOwnerPanelProps {
  collection: Collection
  chainId: number
  onUpdated?: () => void
}

export function CollectionOwnerPanel({ collection, chainId, onUpdated }: CollectionOwnerPanelProps) {
  const contractAddress = collection.contract_address as `0x${string}` | undefined
  const { address } = useAccount()
  const { writeContractAsync, isPending } = useChainWriteContract()
  const { data: tokens = [] } = useCollectionTokens(collection.id)
  const tokenStandard = getCollectionTokenStandard(collection)
  const isErc1155 = tokenStandard === 'erc1155'
  const contractAbi = getCollectionContractAbi(collection)

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
  const [syncingCaps, setSyncingCaps] = useState(false)
  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null)
  const [mintAmount, setMintAmount] = useState('1')
  const [recipient, setRecipient] = useState('')

  const mintedOnChain = totalMinted !== undefined ? Number(totalMinted) : null
  const nextOnChainTokenId = mintedOnChain != null ? mintedOnChain + 1 : null

  const readyTokens = useMemo(
    () =>
      tokens
        .filter(isTokenMetadataReady)
        .sort((a, b) => (a.token_id ?? 0) - (b.token_id ?? 0)),
    [tokens],
  )

  useEffect(() => {
    if (selectedTokenId != null) return
    const preferred = readyTokens.find((token) => token.token_id === nextOnChainTokenId)
    const fallback = readyTokens[0]
    const nextId = preferred?.token_id ?? fallback?.token_id ?? null
    if (nextId != null) setSelectedTokenId(nextId)
  }, [readyTokens, selectedTokenId, nextOnChainTokenId])

  useEffect(() => {
    if (address) setRecipient(address)
  }, [address])

  const { data: selectedEditionCap, isLoading: selectedEditionCapLoading } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'editionCap',
    args: selectedTokenId != null ? [BigInt(selectedTokenId)] : undefined,
    chainId,
    query: {
      enabled: Boolean(contractAddress && isErc1155 && selectedTokenId != null),
    },
  })

  const { data: selectedEditionMinted, isLoading: selectedEditionMintedLoading } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'editionMinted',
    args: selectedTokenId != null ? [BigInt(selectedTokenId)] : undefined,
    chainId,
    query: {
      enabled: Boolean(contractAddress && isErc1155 && selectedTokenId != null),
    },
  })

  if (!contractAddress) return null

  const isOwner = owner && address && owner.toLowerCase() === address.toLowerCase()
  if (!isOwner) return null

  const nextDbToken = tokens.find((token) => token.token_id === nextOnChainTokenId && !token.minted)

  const royaltyPercent =
    royaltyInfo?.[1] !== undefined
      ? formatPercentDisplay(String(Number((royaltyInfo[1] * 10_000n) / parseEther('100')) / 100))
      : '…'

  const isErc1155Lazy = isErc1155 && collection.mint_mode === 'lazy'

  const selectedDbToken = readyTokens.find((token) => token.token_id === selectedTokenId) ?? null
  const selectedEditionSize = Math.max(1, selectedDbToken?.edition_size ?? 1)
  const onChainCap = selectedEditionCap ?? 0n
  const onChainMinted = selectedEditionMinted ?? 0n
  const maxMintAmount =
    onChainCap === 0n ? selectedEditionSize : Number(onChainCap - onChainMinted)
  const editionStateLoading = selectedEditionCapLoading || selectedEditionMintedLoading
  const parsedMintAmount = Number.parseInt(mintAmount, 10)
  const mintAmountValid =
    Number.isFinite(parsedMintAmount) && parsedMintAmount > 0 && parsedMintAmount <= maxMintAmount
  const recipientValid = Boolean(recipient.trim() && isAddress(recipient.trim()))

  const ownerMintErc1155 = async () => {
    if (!address || selectedTokenId == null || !selectedDbToken?.token_id) {
      toast.error('Choose a type with complete metadata to owner mint.')
      return
    }
    if (!recipientValid) {
      toast.error('Enter a valid recipient wallet address.')
      return
    }
    if (!mintAmountValid) {
      toast.error(`Enter a quantity between 1 and ${Math.max(0, maxMintAmount)}.`)
      return
    }

    setOwnerMinting(true)
    try {
      const recipientAddress = getAddress(recipient.trim())
      const amount = BigInt(parsedMintAmount)
      const tokenId = BigInt(selectedTokenId)
      const editionSize = BigInt(selectedEditionSize)

      await syncTokenUri(address, collection.id, selectedTokenId)
      const onChainUri = getOnChainTokenUriSuffix(selectedTokenId)

      if (onChainCap === 0n) {
        await writeContractAsync({
          address: contractAddress,
          abi: SET_EDITION_CAP_ABI,
          functionName: 'setEditionCap',
          args: [tokenId, editionSize],
          chainId,
        })
      }

      const hash = await writeContractAsync({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'ownerMint',
        args: [recipientAddress, tokenId, amount, onChainUri],
        chainId,
      })

      if (!hash) throw new Error('Owner mint did not return a transaction hash')

      const totalMintedAfter = onChainMinted + amount
      const shouldMarkMinted = totalMintedAfter >= editionSize || !selectedDbToken.minted
      if (shouldMarkMinted) {
        await updateToken(address, { tokenId: selectedDbToken.id, minted: true, mintTxHash: hash })
      }

      toast.success(`Minted ${parsedMintAmount} cop${parsedMintAmount === 1 ? 'y' : 'ies'} of type #${selectedTokenId}`)
      onUpdated?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Owner mint failed')
    } finally {
      setOwnerMinting(false)
    }
  }

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

      if (!hash) throw new Error('Owner mint did not return a transaction hash')

      await updateToken(address, { tokenId: nextDbToken.id, minted: true, mintTxHash: hash })
      toast.success(`Minted #${nextOnChainTokenId} to your wallet`)
      onUpdated?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Owner mint failed')
    } finally {
      setOwnerMinting(false)
    }
  }

  const syncEditionCaps = async () => {
    if (!contractAddress) return
    setSyncingCaps(true)
    try {
      await configureErc1155EditionCaps(writeContractAsync, contractAddress, collection.id, chainId, {
        onWalletStep: (label) => toast.message(label),
      })
      toast.success('Edition caps synced on-chain')
      onUpdated?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to sync edition caps')
    } finally {
      setSyncingCaps(false)
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
          <dt className="text-slate-500">{isErc1155 ? 'Types minted on-chain' : 'Minted on-chain'}</dt>
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
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">Owner minting</h3>
          {isErc1155 ? (
            <>
              <p className="text-xs text-slate-500">
                Mint copies of any type to a wallet you choose. Edition caps are set automatically on first mint if
                needed. No paid sale fee applies.
              </p>
              {readyTokens.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="owner-mint-type">Type</Label>
                    <select
                      id="owner-mint-type"
                      className={selectClassName}
                      value={selectedTokenId ?? ''}
                      onChange={(event) => {
                        setSelectedTokenId(Number(event.target.value))
                        setMintAmount('1')
                      }}
                    >
                      {readyTokens.map((token) => (
                        <option key={token.id} value={token.token_id ?? ''}>
                          #{token.token_id} — {token.name} ({Math.max(1, token.edition_size ?? 1)} edition max)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="owner-mint-qty">Quantity</Label>
                    <Input
                      id="owner-mint-qty"
                      type="number"
                      min={1}
                      max={Math.max(1, maxMintAmount)}
                      value={mintAmount}
                      onChange={(event) => setMintAmount(event.target.value)}
                    />
                    <p className="text-xs text-slate-500">
                      {editionStateLoading
                        ? 'Loading on-chain edition state…'
                        : maxMintAmount > 0
                          ? `${Number(onChainMinted)} / ${onChainCap === 0n ? selectedEditionSize : Number(onChainCap)} minted on-chain · up to ${maxMintAmount} available`
                          : 'Edition cap reached for this type'}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="owner-mint-recipient">Recipient wallet</Label>
                    <Input
                      id="owner-mint-recipient"
                      value={recipient}
                      onChange={(event) => setRecipient(event.target.value)}
                      placeholder="0x…"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void ownerMintErc1155()}
                      disabled={
                        ownerMinting ||
                        isPending ||
                        !selectedDbToken ||
                        editionStateLoading ||
                        maxMintAmount <= 0 ||
                        !mintAmountValid ||
                        !recipientValid
                      }
                    >
                      {ownerMinting ? 'Minting…' : 'Owner mint'}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Add name and artwork for at least one type before owner minting.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                Mints the next sequential token to your wallet. No paid sale fee applies.
              </p>
              {nextOnChainTokenId != null && nextOnChainTokenId <= collection.max_supply ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void ownerMintNext()}
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
            </>
          )}
        </section>
      )}

      {isErc1155Lazy && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-200">ERC-1155 edition caps</h3>
          <p className="text-xs text-slate-500">
            Public minting needs on-chain edition caps per type. Caps start at 0 until you sync them from your
            metadata (e.g. Blossom = 10 copies). Required before buyers can mint specific types.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void syncEditionCaps()}
            disabled={syncingCaps || isPending}
          >
            {syncingCaps ? 'Syncing…' : 'Sync edition caps'}
          </Button>
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
