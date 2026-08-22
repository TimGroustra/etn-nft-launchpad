import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { createPublicClient, http, type TransactionReceipt } from 'viem'
import { toast } from 'sonner'
import { useState } from 'react'
import { useCollections } from '@/hooks/useCollections'
import { WalletAuthButton, useWalletAuth } from '@/hooks/useWalletAuth'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { CollectionOwnerPanel } from '@/components/CollectionOwnerPanel'
import { useNetwork } from '@/context/NetworkContext'
import { formatEther } from 'viem'
import { FACTORY_ABI, getChainId, getPublishFeeWei, resolveDeployedCollectionAddress } from '@/lib/blockchain'
import { usePlatformConfig, resolveFactoryAddress } from '@/hooks/usePlatformConfig'
import { firstIssueMessage, validateCollectionForPublish } from '@/lib/create-collection-validation'
import { updateCollection, verifyPublishPayment, verifyCollectionContract, deleteCollection } from '@/lib/api'
import { configurePublicMint, prepareCollectionMetadata, syncPublishedCollection } from '@/lib/publish-collection'
import { listCollectionTokens } from '@/lib/collection-metadata'

export function DashboardPage() {
  const { address, isConnected } = useAccount()
  const { isAuthenticated } = useWalletAuth()
  const { network, chain } = useNetwork()
  const { data: collections = [], refetch } = useCollections(address, getChainId(network))
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { writeContractAsync, data: txHash } = useWriteContract()
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash })

  const { data: platformConfig } = usePlatformConfig()
  const factoryAddress = resolveFactoryAddress(network, platformConfig)
  const zeroAddress = '0x0000000000000000000000000000000000000000' as const
  const { data: onChainPublishFee } = useReadContract({
    address: factoryAddress as `0x${string}`,
    abi: FACTORY_ABI,
    functionName: 'publishFee',
    chainId: chain.id,
    query: { enabled: Boolean(factoryAddress && factoryAddress !== zeroAddress) },
  })
  const publishFee = onChainPublishFee ?? getPublishFeeWei(network)
  const publishFeeLabel = formatEther(publishFee)

  const publish = async (collection: (typeof collections)[0]) => {
    if (!address) return
    setPublishingId(collection.id)
    try {
      const tokens = await listCollectionTokens(collection.id)
      const publishIssues = validateCollectionForPublish(collection, tokens.flatMap((t) => {
        if (t.token_id == null) return []
        return [{
          token_id: t.token_id,
          name: t.name ?? '',
          image_storage_path: t.image_storage_path,
        }]
      }))
      const publishError = firstIssueMessage(publishIssues)
      if (publishError) {
        toast.error(publishError)
        return
      }

      const burnConfig = {
        mintBurnBps: BigInt(collection.mint_burn_bps ?? 0),
        burnOnMint: collection.burn_on_mint,
        royaltyBurnBps: BigInt(collection.royalty_burn_bps ?? 0),
      }

      const hash = await writeContractAsync({
        address: factoryAddress,
        abi: FACTORY_ABI,
        functionName: 'deployCollection',
        args: [collection.name, collection.symbol, burnConfig, BigInt(collection.max_supply)],
        value: publishFee,
        chainId: chain.id,
      })

      const client = createPublicClient({ chain, transport: http() })
      const receipt: TransactionReceipt = await client.waitForTransactionReceipt({ hash })

      const contractAddress = resolveDeployedCollectionAddress(receipt, factoryAddress, address)

      toast.message('Uploading metadata…')
      await prepareCollectionMetadata(address, collection.id)

      toast.message('Configuring public mint (IMintable)…')
      const baseUri = await configurePublicMint(
        writeContractAsync,
        contractAddress as `0x${string}`,
        collection,
        chain.id,
      )

      await updateCollection(address, collection.id, {
        contractAddress,
        baseUri,
        status: 'published',
        chainId: chain.id,
      })

      await verifyPublishPayment(address, collection.id, hash, chain.id)

      toast.message('Verifying contract on block explorer…')
      try {
        const verification = await verifyCollectionContract(
          address,
          collection.id,
          contractAddress,
          chain.id,
        )
        if (verification.status === 'already_verified') {
          toast.success(`Collection published and already verified on ${chain.name}.`)
        } else {
          toast.success(`Collection published on ${chain.name}. Contract verification submitted.`)
        }
      } catch (verifyErr) {
        toast.message(
          `Collection published on ${chain.name}. Explorer verification will need a manual retry: ${
            verifyErr instanceof Error ? verifyErr.message : 'unknown error'
          }`,
        )
      }
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishingId(null)
    }
  }

  const updatePublished = async (collection: (typeof collections)[0]) => {
    if (!address) return
    setUpdatingId(collection.id)
    try {
      toast.message('Saving metadata to Supabase storage…')
      await syncPublishedCollection(address, collection, writeContractAsync, chain.id)
      toast.success('Collection updated in Supabase and on-chain.')
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setUpdatingId(null)
    }
  }

  const deleteDraft = async (collection: (typeof collections)[0]) => {
    if (!address) return
    const confirmed = window.confirm(
      `Delete draft "${collection.name}"? This removes all artwork and metadata and cannot be undone.`,
    )
    if (!confirmed) return

    setDeletingId(collection.id)
    try {
      await deleteCollection(address, collection.id)
      toast.success('Draft deleted')
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  if (!isConnected) {
    return <Card><CardTitle>Connect wallet to view dashboard</CardTitle></Card>
  }

  if (!isAuthenticated) {
    return (
      <Card>
        <CardTitle>Sign in required</CardTitle>
        <WalletAuthButton />
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Collections</h1>
          <p className="text-sm text-slate-400">Showing collections on {chain.name}</p>
        </div>
        <Button asChild><Link to="/create">New Collection</Link></Button>
      </div>

      {collections.length === 0 ? (
        <Card>
          <CardDescription>
            No collections on {chain.name} yet. Switch network to test on testnet before going live on mainnet.
          </CardDescription>
        </Card>
      ) : (
        <div className="grid gap-4">
          {collections.map((collection) => (
            <Card key={collection.id} className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>{collection.name}</CardTitle>
                  <CardDescription>
                    {collection.status} · {collection.mint_mode} · {collection.symbol}
                    {collection.chain_id === 5201420 ? ' · Testnet' : collection.chain_id === 52014 ? ' · Mainnet' : ''}
                  </CardDescription>
                  {collection.contract_address && (
                    <p className="mt-1 text-xs text-green-400">You own this collection contract</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {collection.status === 'draft' && (
                    <>
                      <Button variant="outline" asChild>
                        <Link to={`/draft/${collection.id}/edit`}>Edit</Link>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => deleteDraft(collection)}
                        disabled={deletingId === collection.id}
                        className="border-red-900/60 text-red-300 hover:bg-red-950/40 hover:text-red-200"
                      >
                        {deletingId === collection.id ? 'Deleting…' : 'Delete'}
                      </Button>
                      <Button
                        onClick={() => publish(collection)}
                        disabled={publishingId === collection.id || confirming || factoryAddress === '0x0000000000000000000000000000000000000000'}
                      >
                        {publishingId === collection.id
                          ? 'Publishing...'
                          : `Publish (${publishFeeLabel} ETN)`}
                      </Button>
                    </>
                  )}
                  {collection.contract_address && (
                    <>
                      <Button variant="outline" asChild>
                        <Link to={`/collection/${collection.contract_address}`}>View</Link>
                      </Button>
                      <Button variant="outline" asChild>
                        <Link to={`/collection/${collection.contract_address}/edit`}>Edit</Link>
                      </Button>
                      <Button
                        onClick={() => updatePublished(collection)}
                        disabled={updatingId === collection.id || confirming}
                      >
                        {updatingId === collection.id ? 'Updating…' : 'Update'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {collection.contract_address && (
                <CollectionOwnerPanel
                  collection={collection}
                  chainId={chain.id}
                  onUpdated={() => void refetch()}
                />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
