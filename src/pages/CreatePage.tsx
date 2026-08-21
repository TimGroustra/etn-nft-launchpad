import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input, Label, Textarea } from '@/components/ui/input'
import { WalletAuthButton, useWalletAuth } from '@/hooks/useWalletAuth'
import { createCollection, addToken, uploadImage } from '@/lib/api'
import { useNetwork } from '@/context/NetworkContext'
import { getChainId } from '@/lib/blockchain'

const STEPS = ['Details', 'Burn Config', 'Upload', 'Preview', 'Publish']

export function CreatePage() {
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const { isAuthenticated } = useWalletAuth()
  const { network, chain } = useNetwork()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    symbol: '',
    description: '',
    mintMode: 'lazy' as 'lazy' | 'batch',
    maxSupply: 10000,
    clubBurnAmount: '0',
    burnOnMint: false,
    burnOnResale: false,
  })
  const [tokens, setTokens] = useState<Array<{ name: string; description: string; file: File | null }>>([
    { name: 'Token #1', description: '', file: null },
  ])

  const update = (key: string, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }))

  const saveDraft = async () => {
    if (!address) return
    setLoading(true)
    try {
      const collection = await createCollection(address, {
        name: form.name,
        symbol: form.symbol,
        description: form.description,
        mintMode: form.mintMode,
        maxSupply: form.maxSupply,
        clubBurnAmount: Number(form.clubBurnAmount),
        burnOnMint: form.burnOnMint,
        burnOnResale: form.burnOnResale,
        chainId: getChainId(network),
      })
      setCollectionId(collection.id)

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        let imagePath: string | undefined
        if (token.file) {
          imagePath = await uploadImage(collection.id, i + 1, token.file)
        }
        await addToken(address, {
          collectionId: collection.id,
          tokenId: i + 1,
          name: token.name,
          description: token.description,
          imageStoragePath: imagePath,
          attributes: [],
        })
      }

      toast.success('Draft saved')
      navigate(`/dashboard`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save draft')
    } finally {
      setLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <Card>
        <CardTitle>Connect your wallet</CardTitle>
        <CardDescription className="mt-2">Connect an Electroneum wallet to create a collection.</CardDescription>
      </Card>
    )
  }

  if (!isAuthenticated) {
    return (
      <Card>
        <CardTitle>Sign in with wallet</CardTitle>
        <CardDescription className="mt-2">Authenticate to create and manage collections.</CardDescription>
        <div className="mt-4">
          <WalletAuthButton />
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create Collection</h1>
        <p className="text-slate-400">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
        <p className="text-sm text-slate-500">Creating on {chain.name}</p>
      </div>

      <div className="flex gap-2">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`rounded-full px-3 py-1 text-xs ${i <= step ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
          >
            {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="My Collection" />
          </div>
          <div>
            <Label>Symbol</Label>
            <Input value={form.symbol} onChange={(e) => update('symbol', e.target.value)} placeholder="MYC" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => update('description', e.target.value)} />
          </div>
          <div>
            <Label>Mint Mode</Label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
              value={form.mintMode}
              onChange={(e) => update('mintMode', e.target.value)}
            >
              <option value="lazy">Lazy mint</option>
              <option value="batch">Batch mint at publish</option>
            </select>
          </div>
          <div>
            <Label>Max Supply</Label>
            <Input
              type="number"
              value={form.maxSupply}
              onChange={(e) => update('maxSupply', Number(e.target.value))}
            />
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-4">
          <div>
            <Label>CLUB Burn Amount (per event)</Label>
            <Input
              value={form.clubBurnAmount}
              onChange={(e) => update('clubBurnAmount', e.target.value)}
              placeholder="0"
            />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.burnOnMint} onChange={(e) => update('burnOnMint', e.target.checked)} />
            Burn CLUB on mint
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.burnOnResale} onChange={(e) => update('burnOnResale', e.target.checked)} />
            Burn CLUB on resale
          </label>
          <p className="text-sm text-slate-400">
            When enabled, minters/buyers must approve CLUB before minting or receiving a resale transfer.
          </p>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4">
          {tokens.map((token, i) => (
            <div key={i} className="rounded-lg border border-slate-800 p-4 space-y-3">
              <Input
                value={token.name}
                onChange={(e) => {
                  const next = [...tokens]
                  next[i] = { ...next[i], name: e.target.value }
                  setTokens(next)
                }}
                placeholder="Token name"
              />
              <Textarea
                value={token.description}
                onChange={(e) => {
                  const next = [...tokens]
                  next[i] = { ...next[i], description: e.target.value }
                  setTokens(next)
                }}
                placeholder="Description"
              />
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  const next = [...tokens]
                  next[i] = { ...next[i], file }
                  setTokens(next)
                }}
              />
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() => setTokens([...tokens, { name: `Token #${tokens.length + 1}`, description: '', file: null }])}
          >
            Add Token
          </Button>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-3">
          <CardTitle>{form.name} ({form.symbol})</CardTitle>
          <CardDescription>{form.description}</CardDescription>
          <p className="text-sm">Mint mode: {form.mintMode}</p>
          <p className="text-sm">Max supply: {form.maxSupply}</p>
          <p className="text-sm">
            CLUB burns: {form.clubBurnAmount} — mint: {form.burnOnMint ? 'yes' : 'no'}, resale: {form.burnOnResale ? 'yes' : 'no'}
          </p>
          <p className="text-sm">{tokens.length} token(s) ready</p>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardTitle>Save Draft & Publish</CardTitle>
          <CardDescription className="mt-2">
            Save your draft first, then publish from the dashboard by paying the ETN fee and deploying your contract.
          </CardDescription>
          <Button className="mt-4" onClick={saveDraft} disabled={loading || !form.name || !form.symbol}>
            {loading ? 'Saving...' : 'Save Draft'}
          </Button>
          {collectionId && <p className="mt-2 text-sm text-green-400">Draft saved. Go to dashboard to publish.</p>}
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </Button>
        {step < STEPS.length - 1 && (
          <Button onClick={() => setStep(step + 1)} disabled={step === 0 && (!form.name || !form.symbol)}>
            Next
          </Button>
        )}
      </div>
    </div>
  )
}
