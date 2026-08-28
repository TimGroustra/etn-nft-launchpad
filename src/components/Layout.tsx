import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Rocket } from 'lucide-react'
import { NetworkToggle } from './NetworkToggle'
import { WalletBalance } from './WalletBalance'
import { WalletConnectButton } from './WalletConnectButton'
import { GemShardClaimButton } from './GemShardClaimButton'
import { useNetwork } from '@/context/NetworkContext'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
  }`

export function Layout() {
  const { chain } = useNetwork()
  const { isConnected } = useAccount()

  return (
    <div className="min-h-screen overflow-x-clip bg-slate-950 text-white">
      <header className="relative border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div
          className={`mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:gap-x-4 sm:px-4 sm:py-4 ${
            isConnected ? 'pr-[6.75rem]' : 'pr-[7.25rem]'
          } sm:pr-4`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-6">
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
              {isConnected && (
                <NavLink to="/create" className={navLinkClass}>
                  Create
                </NavLink>
              )}
            </nav>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-2 sm:ml-auto sm:gap-x-3">
            <GemShardClaimButton />
            <span className="hidden text-xs text-slate-500 sm:inline">{chain.name}</span>
            <NetworkToggle />
            <div className="hidden items-center gap-3 sm:flex">
              <WalletBalance />
              <WalletConnectButton />
            </div>
          </div>
        </div>

        <div className="fixed right-3 top-2.5 z-50 flex flex-col items-end gap-1 rounded-lg border border-slate-800/80 bg-slate-950/95 px-2 py-1.5 backdrop-blur sm:hidden">
          {isConnected && <WalletBalance className="text-right" />}
          <WalletConnectButton className="h-7 px-2.5 text-xs" />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-4 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}
