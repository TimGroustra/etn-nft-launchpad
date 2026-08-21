import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAccount, useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { useCollection, useCollectionTokens } from '@/hooks/useCollections'
import { useWalletAuth } from '@/hooks/useWalletAuth'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Input, Label, Textarea } from '@/components/ui/input'
import { getPublicImageUrl } from '@/lib/supabase'
import { updateToken, syncTokenUri, uploadImage } from '@/lib/api'
import { CollectionWithdraw } from '@/components/CollectionWithdraw'
import { MetadataGuidancePanel } from '@/components/MetadataGuidancePanel'
import { NFT_ABI } from '@/lib/blockchain'

export function EditPage() {
  const { address: contractAddress } = useParams()
  const { address } = useAccount()
  const { isAuthenticated } = useWalletAuth()
  const { data: collection } = useCollection(contractAddress)
  const { data: tokens = [], refetch } = useCollectionTokens(collection?.id)
  const { writeContractAsync } = useWriteContract()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '', tokenUri: '', imageUrl: '' })
  const [loading, setLoading] = useState(false)

  const selected = tokens.find((t) => t.id === selectedId)

  const selectToken = (tokenId: string) => {
    const token = tokens.find((t) => t.id === tokenId)
    if (!token) return
    setSelectedId(tokenId)
    setForm({
      name: token.name,
      description: token.description ?? '',
      tokenUri: token.token_uri ?? '',
      imageUrl: token.image_storage_path ? getPublicImageUrl(token.image_storage_path) : '',
    })
  }

  const save = async () => {
    if (!address || !collection || !selected?.token_id) return
    setLoading(true)
    try {
      const customUri = form.tokenUri.trim()
      let onChainUri = customUri

      if (!customUri) {
        await updateToken(address, {
          tokenId: selected.id,
          name: form.name,
          description: form.description,
        })
        const sync = await syncTokenUri(address, collection.id, selected.token_id)
        onChainUri = sync.tokenUri
      } else {
        await updateToken(address, {
          tokenId: selected.id,
          name: form.name,
          description: form.description,
          tokenUri: customUri,
        })
      }

      if (collection.contract_address && onChainUri) {
        await writeContractAsync({
          address: collection.contract_address as `0x${string}`,
          abi: NFT_ABI,
          functionName: 'setTokenURI',
          args: [BigInt(selected.token_id), onChainUri],
        })
      }

      toast.success('Metadata updated on-chain')
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = async (file: File) => {
    if (!address || !collection || !selected?.token_id) return
    const path = await uploadImage(collection.id, selected.token_id, file)
    await updateToken(address, { tokenId: selected.id, imageStoragePath: path })
    setForm((prev) => ({ ...prev, imageUrl: getPublicImageUrl(path), tokenUri: '' }))
    refetch()
    toast.success('Image updated in Supabase storage')
  }

  if (!collection) return <p>Loading...</p>
  if (collection.creator_wallet !== address?.toLowerCase() || !isAuthenticated) {
    return <Card><CardTitle>Only the collection creator can edit metadata.</CardTitle></Card>
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Edit {collection.name}</h1>
        <p className="text-sm text-slate-400">
          Images and metadata JSON are hosted in Supabase by default. To use your own IPFS or storage,
          paste your metadata URL below and sync on-chain.
        </p>
        <MetadataGuidancePanel compact showIpfs />
        {collection.contract_address && (
          <CollectionWithdraw contractAddress={collection.contract_address} />
        )}
        {tokens.map((token) => (
          <button
            key={token.id}
            onClick={() => selectToken(token.id)}
            className={`w-full rounded-lg border p-3 text-left ${selectedId === token.id ? 'border-blue-500' : 'border-slate-800'}`}
          >
            <p className="font-medium">{token.name}</p>
            <p className="text-xs text-slate-500">#{token.token_id}</p>
          </button>
        ))}
      </div>

      {selected && (
        <Card className="space-y-4">
          {(form.imageUrl || selected.image_storage_path) && (
            <img
              src={form.imageUrl || getPublicImageUrl(selected.image_storage_path!)}
              alt={selected.name}
              className="aspect-square w-full rounded-lg object-cover"
            />
          )}
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label>Replace image (Supabase storage)</Label>
            <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
          </div>
          <div>
            <Label>Metadata / token URI</Label>
            <Input
              value={form.tokenUri}
              onChange={(e) => setForm({ ...form, tokenUri: e.target.value })}
              placeholder="Leave blank to auto-generate from Supabase, or paste ipfs:// / https://"
            />
            <p className="mt-1 text-xs text-slate-500">
              Blank = rebuild JSON in Supabase storage. Custom URL = your own metadata (IPFS, Arweave, etc.).
            </p>
          </div>
          <Button onClick={save} disabled={loading}>
            {loading ? 'Saving...' : 'Save & Sync On-Chain'}
          </Button>
        </Card>
      )}
    </div>
  )
}
