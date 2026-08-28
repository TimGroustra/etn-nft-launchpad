import { useCallback } from 'react'
import { usePublicClient, useWriteContract } from 'wagmi'
import type { WriteContractParameters } from 'wagmi/actions'

/**
 * Like useWriteContract, but each write waits for on-chain confirmation before
 * resolving. Required when submitting multiple transactions in sequence — otherwise
 * the wallet can reuse a stale nonce ("nonce too low").
 */
export function useChainWriteContract() {
  const { writeContractAsync, ...rest } = useWriteContract()
  const publicClient = usePublicClient()

  const writeContractChained = useCallback(
    async (variables: WriteContractParameters) => {
      if (!publicClient) {
        throw new Error('Wallet not connected to a network')
      }

      const hash = await writeContractAsync(variables)
      if (!hash) {
        throw new Error('Transaction was not submitted')
      }

      await publicClient.waitForTransactionReceipt({ hash })
      return hash
    },
    [publicClient, writeContractAsync],
  )

  return {
    ...rest,
    writeContractAsync: writeContractChained,
  }
}
