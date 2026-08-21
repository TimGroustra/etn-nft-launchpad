import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { createPublicClient, decodeEventLog, http, type TransactionReceipt } from 'viem'
import { toast } from 'sonner'
import { useState } from 'react'
import { useCollections } from '@/hooks/useCollections'
import { WalletAuthButton, useWalletAuth } from '@/hooks/useWalletAuth'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { CollectionWithdraw } from '@/components/CollectionWithdraw'
import { useNetwork } from '@/context/NetworkContext'
import { FACTORY_ABI, formatPublishFeeEtn, getChainId, getPublishFeeWei } from '@/lib/blockchain'
import { usePlatformConfig, resolveFactoryAddress } from '@/hooks/usePlatformConfig'
import { parseClubAmount } from '@/lib/utils'
import { updateCollection, verifyPublishPayment } from '@/lib/api'

export function DashboardPage() {
  const { address, isConnected } = useAccount()
  const { isAuthenticated } = useWalletAuth()
  const { network, chain } = useNetwork()
  const { data: collections = [], refetch } = useCollections(address, getChainId(network))
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const { writeContractAsync, data: txHash } = useWriteContract()
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash })

  const { data: platformConfig } = usePlatformConfig()
  const factoryAddress = resolveFactoryAddress(network, platformConfig)
  const publishFee = getPublishFeeWei(network)

  const publish = async (collection: (typeof collections)[0]) => {
    if (!address) return
    setPublishingId(collection.id)
    try {
      const burnConfig = {
        clubBurnAmount: parseClubAmount(String(collection.club_burn_amount)),
        burnOnMint: collection.burn_on_mint,
        burnOnResale: collection.burn_on_resale,
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

      const deployedLog = receipt.logs.find((log) => log.topics.length >= 3)
      let contractAddress = ''
      if (deployedLog) {
        try {
          const decoded = decodeEventLog({
            abi: FACTORY_ABI,
            data: deployedLog.data,
            topics: deployedLog.topics,
          })
          if (decoded.eventName === 'CollectionDeployed') {
            contractAddress = (decoded.args as { collection: string }).collection
          }
        } catch {
          contractAddress = `0x${deployedLog.topics[2]?.slice(26)}`
        }
      }

      await updateCollection(address, collection.id, {
        contractAddress,
        status: 'published',
        chainId: chain.id,
      })

      await verifyPublishPayment(address, collection.id, hash, chain.id)
      toast.success(`Collection published on ${chain.name}. You are the contract owner.`)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishingId(null)
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
                    <Button
                      onClick={() => publish(collection)}
                      disabled={publishingId === collection.id || confirming || factoryAddress === '0x0000000000000000000000000000000000000000'}
                    >
                      {publishingId === collection.id
                        ? 'Publishing...'
                        : `Publish (${formatPublishFeeEtn(network)} ETN)`}
                    </Button>
                  )}
                  {collection.contract_address && (
                    <>
                      <Button variant="outline" asChild>
                        <Link to={`/collection/${collection.contract_address}`}>View</Link>
                      </Button>
                      <Button variant="outline" asChild>
                        <Link to={`/collection/${collection.contract_address}/edit`}>Edit</Link>
                      </Button>
                      <Button variant="outline" asChild>
                        <Link to={`/collection/${collection.contract_address}/mint`}>Mint</Link>
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {collection.contract_address && (
                <CollectionWithdraw contractAddress={collection.contract_address} />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
