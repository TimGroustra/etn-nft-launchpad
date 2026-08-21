import { Link, Outlet } from 'react-router-dom'
import { useAppKit } from '@reown/appkit/react'
import { Rocket } from 'lucide-react'
import { Button } from './ui/button'
import { NetworkToggle } from './NetworkToggle'
import { useNetwork } from '@/context/NetworkContext'

export function Layout() {
  const { open } = useAppKit()
  const { chain } = useNetwork()

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Rocket className="h-5 w-5 text-blue-400" />
            ETN NFT Launchpad
          </Link>
          <nav className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">{chain.name}</span>
            <NetworkToggle />
            <Button variant="ghost" asChild>
              <Link to="/create">Create</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/dashboard">Dashboard</Link>
            </Button>
            <Button variant="outline" onClick={() => open()}>
              Connect Wallet
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
