import { DEFAULT_ROYALTY_BPS, formatRoyaltyPercent, shortenAddress } from '@/lib/nft-metadata'

type RoyaltyInfoPanelProps = {
  creatorWallet?: string
  royaltyBurnPercent: string
  compact?: boolean
}

export function RoyaltyInfoPanel({ creatorWallet, royaltyBurnPercent, compact }: RoyaltyInfoPanelProps) {
  const burnPercent = Number(royaltyBurnPercent) || 0
  const creatorShare = Math.max(0, 100 - burnPercent)

  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/50 ${compact ? 'p-4' : 'p-5'}`}>
      <h3 className="font-medium text-white">How royalties work</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        Marketplace royalties are enforced on-chain via EIP-2981 — not in your metadata JSON. We never write{' '}
        <code className="text-slate-300">fee_recipient</code> or{' '}
        <code className="text-slate-300">seller_fee_basis_points</code> to token files, so collectors and
        marketplaces cannot be misled by conflicting off-chain settings.
      </p>

      <dl className="mt-4 grid gap-3 text-sm">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-slate-400">Marketplace royalty rate</dt>
          <dd className="mt-1 font-medium text-white">{formatRoyaltyPercent(DEFAULT_ROYALTY_BPS)} (fixed at deploy)</dd>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-slate-400">On-chain royalty recipient</dt>
          <dd className="mt-1 font-medium text-white">Your collection contract</dd>
          <dd className="mt-1 text-xs text-slate-500">
            Secondary sales send royalty ETN to the contract — not to a wallet address in metadata.
          </dd>
        </div>
        {creatorWallet && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <dt className="text-slate-400">You withdraw royalties from</dt>
            <dd className="mt-1 font-mono text-sm text-emerald-300">{shortenAddress(creatorWallet)}</dd>
            <dd className="mt-1 text-xs text-slate-500">
              Only the collection owner ({shortenAddress(creatorWallet)}) can withdraw ETN held by the contract.
            </dd>
          </div>
        )}
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-slate-400">Royalties burn (your setting)</dt>
          <dd className="mt-1 font-medium text-white">
            {burnPercent > 0
              ? `${burnPercent}% of received royalties → CLUB burn · ${creatorShare}% withdrawable by you`
              : 'Off — 100% of royalties withdrawable by you'}
          </dd>
        </div>
      </dl>
    </div>
  )
}
