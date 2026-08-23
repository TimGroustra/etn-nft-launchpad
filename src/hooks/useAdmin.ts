import { useAccount } from 'wagmi'
import { isAdminWallet } from '@/lib/admin'

export function useAdmin() {
  const { address, isConnected } = useAccount()
  const isAdmin = isAdminWallet(address)

  return { isAdmin, address, isConnected }
}
