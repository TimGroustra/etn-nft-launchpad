import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAccount, useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { useCollection, useCollectionTokens } from '@/hooks/useCollections'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { NFT_ABI } from '@/lib/blockchain'
import { syncTokenUri, updateToken } from '@/lib/api'
import { getPublicImageUrl } from '@/lib/supabase'

const CHUNK_SIZE = 20

export function MintPage() {
  const { address: contractAddress } = useParams()
  const { address } = useAccount()
  const { data: collection } = useCollection(contractAddress)
  const { data: tokens = [], refetch } = useCollectionTokens(collection?.id)
  const { writeContractAsync } = useWriteContract()
  const [minting, setMinting] = useState(false)

  const lazyMint = async (tokenId: number, dbId: string) => {
    if (!address || !collection?.contract_address) return
    setMinting(true)
    try {
      const sync = await syncTokenUri(address, collection.id, tokenId)
      const hash = await writeContractAsync({
        address: collection.contract_address as `0x${string}`,
        abi: NFT_ABI,
        functionName: 'ownerMint',
        args: [address, sync.tokenUri],
      })
      await updateToken(address, { tokenId: dbId, minted: true, mintTxHash: hash })
      toast.success(`Minted #${tokenId}`)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mint failed')
    } finally {
      setMinting(false)
    }
  }

  const batchMint = async () => {
    if (!address || !collection?.contract_address) return
    const unminted = tokens.filter((t) => !t.minted && t.token_id)
    if (unminted.length === 0) return

    setMinting(true)
    try {
      for (let i = 0; i < unminted.length; i += CHUNK_SIZE) {
        const chunk = unminted.slice(i, i + CHUNK_SIZE)
        const uris: string[] = []
        for (const token of chunk) {
          const sync = await syncTokenUri(address, collection.id, token.token_id!)
          uris.push(sync.tokenUri)
        }
        await writeContractAsync({
          address: collection.contract_address as `0x${string}`,
          abi: NFT_ABI,
          functionName: 'batchMint',
          args: [chunk.map(() => address), uris],
        })
        for (const token of chunk) {
          await updateToken(address, { tokenId: token.id, minted: true })
        }
      }
      toast.success('Batch mint complete')
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Batch mint failed')
    } finally {
      setMinting(false)
    }
  }

  if (!collection) return <p>Loading...</p>

  const unminted = tokens.filter((t) => !t.minted)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mint {collection.name}</h1>
        <CardDescription>Mode: {collection.mint_mode}</CardDescription>
      </div>

      {collection.burn_on_mint && Number(collection.club_burn_amount) > 0 && (
        <Card>
          <CardTitle>CLUB burn on ElectroSwap mint</CardTitle>
          <CardDescription className="mt-2">
            Each IMintable mint swaps ETN for {collection.club_burn_amount} CLUB and burns it. Owner lazy/batch mints here
            do not trigger this burn.
          </CardDescription>
        </Card>
      )}

      {collection.mint_mode === 'batch' && unminted.length > 0 && (
        <Button onClick={batchMint} disabled={minting}>
          {minting ? 'Minting...' : `Batch Mint ${unminted.length} tokens`}
        </Button>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tokens.map((token) => (
          <Card key={token.id}>
            {token.image_storage_path && (
              <img
                src={getPublicImageUrl(token.image_storage_path)}
                alt={token.name}
                className="mb-3 aspect-square w-full rounded-lg object-cover"
              />
            )}
            <CardTitle>{token.name}</CardTitle>
            <p className="text-xs text-slate-500">#{token.token_id} · {token.minted ? 'Minted' : 'Available'}</p>
            {!token.minted && collection.mint_mode === 'lazy' && token.token_id && (
              <Button
                className="mt-3"
                size="sm"
                disabled={minting}
                onClick={() => lazyMint(token.token_id!, token.id)}
              >
                Mint
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
