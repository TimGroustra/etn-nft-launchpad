import { IMAGE_RULES } from '@/lib/validate-upload-image'

type MetadataGuidancePanelProps = {
  compact?: boolean
  showIpfs?: boolean
}

const TEMPLATE_URL = '/templates/token-metadata.template.json'
const EXAMPLE_URL = '/templates/example-token-1.json'
const IPFS_GUIDE_URL = '/templates/ipfs-folder-structure.txt'
const GUIDE_URL = '/docs/metadata-guide.md'

export function MetadataGuidancePanel({ compact, showIpfs = true }: MetadataGuidancePanelProps) {
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/50 ${compact ? 'p-4' : 'p-5'}`}>
      <h3 className="font-medium text-white">Metadata & image compatibility</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        Follow these rules so wallets, marketplaces, and ElectroSwap read your collection correctly. The platform
        builds JSON for you — you only need name, optional description, and an image per token.
      </p>

      <div className={`mt-4 grid gap-3 ${compact ? '' : 'md:grid-cols-2'}`}>
        <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
          <h4 className="font-medium text-white">Images</h4>
          <ul className="mt-2 list-inside list-disc space-y-1 text-slate-400">
            <li>PNG, JPEG, WebP, or GIF</li>
            <li>
              {IMAGE_RULES.minWidth}×{IMAGE_RULES.minHeight}px min · {IMAGE_RULES.maxWidth}×
              {IMAGE_RULES.maxHeight}px max
            </li>
            <li>10 MB max per file</li>
            <li>Square (1:1) recommended — e.g. 1024×1024</li>
            <li>Original filename does not matter; token # is assigned on save</li>
          </ul>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
          <h4 className="font-medium text-white">Metadata JSON</h4>
          <ul className="mt-2 list-inside list-disc space-y-1 text-slate-400">
            <li>
              Fields: <code className="text-slate-300">name</code>,{' '}
              <code className="text-slate-300">description</code>,{' '}
              <code className="text-slate-300">image</code>,{' '}
              <code className="text-slate-300">attributes</code>
            </li>
            <li>Name max 80 chars · description max 2000 chars</li>
            <li>Token IDs are 1-based (#1, #2, …)</li>
            <li>Preview step shows the exact JSON written at publish</li>
          </ul>
        </section>
      </div>

      <section className="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-sm">
        <h4 className="font-medium text-amber-200">Do not put royalties in JSON</h4>
        <p className="mt-1 text-amber-100/80">
          Never include{' '}
          <code className="text-amber-100">fee_recipient</code>,{' '}
          <code className="text-amber-100">seller_fee_basis_points</code>, or similar royalty keys. Royalties are
          fixed on-chain (EIP-2981).
        </p>
      </section>

      {showIpfs && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Using IPFS later? Name files <code className="text-slate-400">1.json</code>,{' '}
          <code className="text-slate-400">2.json</code> under your folder so public mint base URI resolves correctly.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={TEMPLATE_URL}
          download="token-metadata.template.json"
          className="inline-flex items-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-white"
        >
          Download JSON template
        </a>
        <a
          href={EXAMPLE_URL}
          download="example-token-1.json"
          className="inline-flex items-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-white"
        >
          Example token #1
        </a>
        {showIpfs && (
          <a
            href={IPFS_GUIDE_URL}
            download="ipfs-folder-structure.txt"
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-white"
          >
            IPFS folder guide
          </a>
        )}
        <a
          href={GUIDE_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-white"
        >
          Full creator guide
        </a>
      </div>
    </div>
  )
}
