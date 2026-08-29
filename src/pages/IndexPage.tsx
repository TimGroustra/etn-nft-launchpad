import { NftMintingPanel } from '@/components/NftMintingPanel'

export function IndexPage() {
  return (
    <div className="space-y-10">
      <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900/80 via-slate-950 to-slate-950 px-6 py-8 sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-3xl text-center sm:text-left">
          <h1 className="text-3xl font-bold">Mint NFTs</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:mx-0 sm:text-base">
            Discover live collections, mint instantly.
          </p>
        </div>
      </div>
      <NftMintingPanel />
    </div>
  )
}
