import { NftMintingPanel } from '@/components/NftMintingPanel'

export function IndexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mint NFTs</h1>
        <p className="mt-2 text-slate-400">Browse published collections and mint on Electroneum mainnet.</p>
      </div>
      <NftMintingPanel />
    </div>
  )
}
