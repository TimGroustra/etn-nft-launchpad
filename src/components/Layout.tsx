import { Outlet } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { NetworkToggle } from './NetworkToggle'
import { WalletAddress } from './WalletAddress'
import { WalletConnectButton } from './WalletConnectButton'
import { WalletDisconnectButton } from './WalletDisconnectButton'
import { GemShardClaimButton } from './GemShardClaimButton'
import { SiteHeaderNav } from './SiteHeaderNav'
import { SiteLogo } from './SiteLogo'

export function Layout() {
  const { isConnected } = useAccount()

  return (
    <div className="min-h-screen overflow-x-clip bg-slate-950 text-white">
      <header className="relative z-50 border-b border-slate-700/60 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-x-2 gap-y-2 px-3 py-2.5 sm:gap-x-4 sm:px-4 sm:py-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
            <SiteLogo />
            <SiteHeaderNav />
          </div>

          <div className="flex shrink-0 items-center justify-end gap-x-1 gap-y-2 sm:gap-x-3">
            <GemShardClaimButton />
            <NetworkToggle />
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              {isConnected ? (
                <>
                  <WalletDisconnectButton />
                  <WalletAddress />
                </>
              ) : (
                <WalletConnectButton className="h-7 px-2 text-xs sm:h-9 sm:px-3 sm:text-sm" />
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-4 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}
