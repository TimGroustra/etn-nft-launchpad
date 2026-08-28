import { useState } from 'react'
import { formatEther, getAddress, isAddress } from 'viem'
import { useAccount, useBalance, useReadContract, useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { GEM_SHARDS_ABI, type GemShardsContractAddress } from '@/lib/gem-shards'

type GemShardsOwnerPanelProps = {
  contractAddress: GemShardsContractAddress
  chainId: number
}

export function GemShardsOwnerPanel({ contractAddress, chainId }: GemShardsOwnerPanelProps) {
  const { address } = useAccount()
  const { writeContractAsync, isPending } = useWriteContract()
  const [recipient, setRecipient] = useState('')
  const [ownerMinting, setOwnerMinting] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

  const { data: owner } = useReadContract({
    address: contractAddress,
    abi: GEM_SHARDS_ABI,
    functionName: 'owner',
    chainId,
  })

  const { data: totalMinted } = useReadContract({
    address: contractAddress,
    abi: GEM_SHARDS_ABI,
    functionName: 'totalMinted',
    chainId,
  })

  const { data: remainingSupply, refetch: refetchSupply } = useReadContract({
    address: contractAddress,
    abi: GEM_SHARDS_ABI,
    functionName: 'remainingSupply',
    chainId,
  })

  const { data: balance, refetch: refetchBalance } = useBalance({
    address: contractAddress,
    chainId,
  })

  const isContractOwner =
    Boolean(owner && address) && owner.toLowerCase() === address.toLowerCase()
  const hasBalance = Boolean(balance && balance.value > 0n)
  const supplyRemaining = remainingSupply ?? 495n
  const canOwnerMint = supplyRemaining > 0n
  const recipientValid = Boolean(recipient.trim() && isAddress(recipient.trim()))

  if (!isContractOwner) return null

  const withdraw = async () => {
    setWithdrawing(true)
    try {
      await writeContractAsync({
        address: contractAddress,
        abi: GEM_SHARDS_ABI,
        functionName: 'withdraw',
        chainId,
      })
      toast.success('Paid mint revenue withdrawn to your wallet')
      await refetchBalance()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Withdraw failed')
    } finally {
      setWithdrawing(false)
    }
  }

  const ownerMint = async () => {
    if (!recipientValid) {
      toast.error('Enter a valid recipient wallet address.')
      return
    }

    setOwnerMinting(true)
    try {
      const recipientAddress = getAddress(recipient.trim())
      await writeContractAsync({
        address: contractAddress,
        abi: GEM_SHARDS_ABI,
        functionName: 'ownerMint',
        args: [recipientAddress],
        chainId,
      })
      toast.success(`Random Gem Shard minted to ${recipientAddress}`)
      setRecipient('')
      await Promise.all([refetchBalance(), refetchSupply()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Owner mint failed')
    } finally {
      setOwnerMinting(false)
    }
  }

  return (
    <section className="mt-6 space-y-4 border-t border-violet-900/40 pt-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-200">Treasury controls</h3>
        <p className="mt-1 text-xs text-slate-500">
          Paid mint revenue stays in the contract until you withdraw. Owner mint assigns a random unminted shard.
        </p>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Minted</dt>
          <dd className="font-medium text-white">{totalMinted?.toString() ?? '…'} / 495</dd>
        </div>
        <div>
          <dt className="text-slate-500">Remaining</dt>
          <dd className="font-medium text-white">{supplyRemaining.toString()}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Contract balance</dt>
          <dd className="font-medium text-white">
            {balance ? `${formatEther(balance.value)} ETN` : '…'}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void withdraw()}
          disabled={withdrawing || isPending || !hasBalance}
        >
          {withdrawing ? 'Withdrawing…' : 'Withdraw ETN'}
        </Button>
      </div>

      <div className="grid gap-3 sm:max-w-md">
        <div className="space-y-1.5">
          <Label htmlFor="gem-shard-owner-mint-recipient">Owner mint recipient</Label>
          <Input
            id="gem-shard-owner-mint-recipient"
            placeholder="0x…"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
          />
        </div>
        <Button
          size="sm"
          onClick={() => void ownerMint()}
          disabled={ownerMinting || isPending || !canOwnerMint || !recipientValid}
        >
          {ownerMinting ? 'Minting…' : 'Owner mint random shard'}
        </Button>
      </div>
    </section>
  )
}
