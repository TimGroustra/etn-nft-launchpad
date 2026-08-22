import { Link, NavLink, Outlet } from 'react-router-dom'
import { Rocket } from 'lucide-react'
import { NetworkToggle } from './NetworkToggle'
import { WalletConnectButton } from './WalletConnectButton'
import { useNetwork } from '@/context/NetworkContext'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
  }`

export function Layout() {
  const { chain } = useNetwork()

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex min-w-0 items-center gap-6">
            <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold">
              <Rocket className="h-5 w-5 text-blue-400" />
              ETN NFT Launchpad
            </Link>
            <nav className="flex items-center gap-1">
              <NavLink to="/create" className={navLinkClass}>
                Create
              </NavLink>
              <NavLink to="/" end className={navLinkClass}>
                Mint
              </NavLink>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">{chain.name}</span>
            <NetworkToggle />
            <WalletConnectButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
