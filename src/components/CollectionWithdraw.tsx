import { useAccount, useBalance, useReadContract, useWriteContract } from 'wagmi'
import { formatEther } from 'viem'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NFT_ABI } from '@/lib/blockchain'

interface CollectionWithdrawProps {
  contractAddress: string
}

export function CollectionWithdraw({ contractAddress }: CollectionWithdrawProps) {
  const { address } = useAccount()
  const { writeContractAsync, isPending } = useWriteContract()

  const { data: owner } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: NFT_ABI,
    functionName: 'owner',
  })

  const { data: balance, refetch } = useBalance({
    address: contractAddress as `0x${string}`,
  })

  const isOwner = owner && address && owner.toLowerCase() === address.toLowerCase()
  const hasBalance = balance && balance.value > 0n

  if (!isOwner) return null

  const withdraw = async () => {
    try {
      await writeContractAsync({
        address: contractAddress as `0x${string}`,
        abi: NFT_ABI,
        functionName: 'withdraw',
      })
      toast.success('ETN withdrawn to your wallet')
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Withdraw failed')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400">
        Contract balance: {balance ? formatEther(balance.value) : '0'} ETN
      </span>
      <Button size="sm" variant="outline" onClick={withdraw} disabled={isPending || !hasBalance}>
        {isPending ? 'Withdrawing...' : 'Withdraw ETN'}
      </Button>
    </div>
  )
}
