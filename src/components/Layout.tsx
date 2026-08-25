import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Rocket } from 'lucide-react'
import { NetworkToggle } from './NetworkToggle'
import { WalletBalance } from './WalletBalance'
import { WalletConnectButton } from './WalletConnectButton'
import { useNetwork } from '@/context/NetworkContext'
import { useCanAccessCreatorTools } from '@/hooks/useCanAccessCreatorTools'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
  }`

export function Layout() {
  const { chain } = useNetwork()
  const { canAccessCreatorTools, holdingsLoading } = useCanAccessCreatorTools()
  const { isConnected } = useAccount()

  return (
    <div className="min-h-screen overflow-x-clip bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:gap-x-4 sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-6">
            <Link
              to="/"
              className="flex shrink-0 items-center rounded-md p-1.5 font-semibold transition-colors hover:bg-slate-900"
              aria-label="ETN NFT Launchpad home"
            >
              <Rocket className="h-5 w-5 text-blue-400" />
            </Link>
            <nav className="flex flex-wrap items-center gap-1">
              <NavLink to="/" end className={navLinkClass}>
                Mint
              </NavLink>
              <NavLink to="/dashboard" className={navLinkClass}>
                Dashboard
              </NavLink>
              {isConnected && !holdingsLoading && canAccessCreatorTools && (
                <NavLink to="/create" className={navLinkClass}>
                  Create
                </NavLink>
              )}
            </nav>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-2 sm:ml-auto sm:gap-x-3">
            <span className="hidden text-xs text-slate-500 sm:inline">{chain.name}</span>
            <WalletBalance />
            <NetworkToggle />
            <WalletConnectButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-4 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}
