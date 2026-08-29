import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Rocket, Settings } from 'lucide-react'
import { NetworkToggle } from './NetworkToggle'
import { WalletAddress } from './WalletAddress'
import { WalletConnectButton } from './WalletConnectButton'
import { WalletDisconnectButton } from './WalletDisconnectButton'
import { GemShardClaimButton } from './GemShardClaimButton'
import { SiteHeaderNav } from './SiteHeaderNav'
import { Button } from '@/components/ui/button'
import { useAdmin } from '@/hooks/useAdmin'
import { useAvailableGems } from '@/hooks/use-available-gems'
import { canEditGallery, GALLERY_TREASURY_PREVIEW } from '@/lib/gallery-access'

export function GalleryLayout() {
  const { isConnected, address } = useAccount()
  const { isAdmin } = useAdmin()
  const { ownedTokens } = useAvailableGems(address)
  const location = useLocation()
  const showEdit = canEditGallery(address, isAdmin, ownedTokens.length)
  const onConfigPage = location.pathname.startsWith('/gallery/config')

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-white">
      <header className="relative z-50 shrink-0 border-b border-slate-700/60 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-x-2 gap-y-2 px-3 py-2.5 sm:gap-x-4 sm:px-4 sm:py-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
            <Link
              to="/"
              className="flex shrink-0 items-center rounded-md p-1.5 font-semibold transition-colors hover:bg-slate-900"
              aria-label="ETN NFT Launchpad home"
            >
              <Rocket className="h-5 w-5 text-blue-400" />
            </Link>
            <SiteHeaderNav />
            {GALLERY_TREASURY_PREVIEW && (
              <span className="hidden rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300 sm:inline">
                Admin preview
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-x-1 gap-y-2 sm:gap-x-3">
            {showEdit && !onConfigPage && (
              <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-slate-300 hover:text-white">
                <Link to="/gallery/config" title="Configure gallery panels">
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">Configure</span>
                </Link>
              </Button>
            )}
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

      <main className="relative min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
