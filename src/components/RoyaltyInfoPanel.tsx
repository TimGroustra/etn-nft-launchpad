import { formatPercentDisplay, MIN_ROYALTY_BURN_PERCENT } from '@/lib/create-collection-validation'

type RoyaltyInfoPanelProps = {
  creatorWallet?: string
  royaltyPercent: string
  royaltyBurnPercent: string
  compact?: boolean
}

export function RoyaltyInfoPanel({
  creatorWallet,
  royaltyPercent,
  royaltyBurnPercent,
  compact,
}: RoyaltyInfoPanelProps) {
  const resaleRoyalty = Number(formatPercentDisplay(royaltyPercent)) || 0
  const burnPercent = Number(formatPercentDisplay(royaltyBurnPercent)) || 0
  const creatorShare = Math.max(0, 100 - burnPercent)

  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/50 ${compact ? 'p-4' : 'p-5'}`}>
      <h3 className="font-medium text-white">Your royalty &amp; burn settings</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        These apply when someone <strong className="font-normal text-slate-300">resells</strong> your NFT. New mint
        burns (if you enabled them) are separate and shown in your summary above.
      </p>

      <dl className="mt-4 grid gap-3 text-sm">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-slate-400">Resale royalty</dt>
          <dd className="mt-1 font-medium text-white">{resaleRoyalty}% of each secondary sale</dd>
          {resaleRoyalty > 0 && (
            <dd className="mt-1 text-xs text-slate-500">
              With ~3% marketplace fee, seller keeps about {Math.max(0, 100 - resaleRoyalty - 3)}% of the sale price.
            </dd>
          )}
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-slate-400">Where resale ETN goes first</dt>
          <dd className="mt-1 font-medium text-white">Your collection contract</dd>
          <dd className="mt-1 text-xs text-slate-500">
            Marketplaces send resale fees to the contract, not straight to your wallet.
          </dd>
        </div>
        {creatorWallet && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <dt className="text-slate-400">You withdraw leftover ETN from</dt>
            <dd className="mt-1 font-mono text-sm text-emerald-300">
              {creatorWallet.slice(0, 6)}…{creatorWallet.slice(-4)}
            </dd>
            <dd className="mt-1 text-xs text-slate-500">Only the collection owner can withdraw from the contract.</dd>
          </div>
        )}
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-slate-400">Burn from resales</dt>
          <dd className="mt-1 font-medium text-white">
            {burnPercent > 0
              ? `${burnPercent}% of resale income → CLUB burn · ${creatorShare}% left for you to withdraw`
              : `${MIN_ROYALTY_BURN_PERCENT}% minimum on new collections`}
          </dd>
          {burnPercent === 100 && (
            <dd className="mt-1 text-xs text-emerald-400/90">All resale royalties will be burned as CLUB.</dd>
          )}
        </div>
      </dl>
    </div>
  )
}
