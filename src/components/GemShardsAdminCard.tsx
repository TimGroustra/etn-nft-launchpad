import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { useAdmin } from '@/hooks/useAdmin'
import { useGemShardsLaunch } from '@/hooks/useGemShardsLaunch'
import { useNetwork } from '@/context/NetworkContext'
import { useCollections } from '@/hooks/useCollections'
import { getChainId } from '@/lib/blockchain'
import { publishGemShards, verifyCollectionContract } from '@/lib/api'
import { GEM_SHARDS_ABI } from '@/lib/gem-shards'

export function GemShardsAdminCard() {
  const { address } = useAccount()
  const { isAdmin } = useAdmin()
  const { chain, network } = useNetwork()
  const chainId = getChainId(network)
  const queryClient = useQueryClient()
  const { data: collections = [] } = useCollections(address, chainId, 'active')
  const { writeContractAsync, isPending: txPending } = useWriteContract()
  const { gemShardsAddress, isPublished, isConfigured, networkKey } = useGemShardsLaunch()
  const [publishing, setPublishing] = useState(false)
  const gemShardsCollection = collections.find((collection) => collection.symbol === 'GSHARD')

  if (!isAdmin || !isConfigured) return null

  async function handlePublish() {
    if (!address) {
      toast.error('Connect your wallet first.')
      return
    }

    setPublishing(true)
    try {
      await writeContractAsync({
        address: gemShardsAddress,
        abi: GEM_SHARDS_ABI,
        functionName: 'setMintingEnabled',
        args: [true],
        chainId: chain.id,
      })
      await publishGemShards(networkKey)
      await queryClient.invalidateQueries({ queryKey: ['platform-config'] })
      await queryClient.invalidateQueries({ queryKey: ['mint-panel-collections'] })
      await queryClient.invalidateQueries({ queryKey: ['collections'] })
      await queryClient.invalidateQueries({ queryKey: ['collection'] })

      if (gemShardsCollection?.contract_address) {
        try {
          const verification = await verifyCollectionContract(
            address,
            gemShardsCollection.id,
            gemShardsCollection.contract_address,
            chain.id,
          )
          if (verification.status === 'already_verified') {
            toast.success('Gem Shards published. Contract already verified on explorer.')
          } else {
            toast.success('Gem Shards published and submitted for explorer verification.')
          }
        } catch (verifyError) {
          toast.success('Gem Shards published — minting is live.')
          toast.error(
            verifyError instanceof Error
              ? `Explorer verification failed: ${verifyError.message}`
              : 'Explorer verification failed.',
          )
        }
      } else {
        toast.success('Gem Shards published — minting is now live.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Card className="border-violet-900/50 bg-violet-950/20 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle>Gem Shards</CardTitle>
          <CardDescription className="mt-2 max-w-xl">
            Platform fee-sharing collection (495 supply). Saved as{' '}
            <span className="font-medium text-white">{isPublished ? 'published' : 'draft'}</span>
            {isPublished
              ? ' — minting is live on the NFT Minting Panel and collection page.'
              : ' — hidden from users until you publish.'}
          </CardDescription>
          <p className="mt-2 font-mono text-xs text-slate-500">{gemShardsAddress}</p>
        </div>
        {!isPublished && (
          <Button onClick={handlePublish} disabled={publishing || txPending}>
            {publishing || txPending ? 'Publishing…' : 'Publish Gem Shards'}
          </Button>
        )}
      </div>
    </Card>
  )
}
