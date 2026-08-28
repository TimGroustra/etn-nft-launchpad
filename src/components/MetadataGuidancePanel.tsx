import { IMAGE_RULES } from '@/lib/validate-upload-image'
import type { TokenStandard } from '@/lib/token-standard-ui'
import { isErc1155 } from '@/lib/token-standard-ui'

type MetadataGuidancePanelProps = {
  compact?: boolean
  showIpfs?: boolean
  tokenStandard?: TokenStandard
}

const TEMPLATE_URL = '/templates/token-metadata.template.json'
const EXAMPLE_URL = '/templates/example-token-1.json'
const IPFS_GUIDE_URL = '/templates/ipfs-folder-structure.txt'
const GUIDE_URL = '/docs/metadata-guide.md'

export function MetadataGuidancePanel({
  compact,
  showIpfs = true,
  tokenStandard = 'erc721',
}: MetadataGuidancePanelProps) {
  const erc1155 = isErc1155(tokenStandard)

  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/50 ${compact ? 'p-4' : 'p-5'}`}>
      <h3 className="font-medium text-white">
        {erc1155 ? 'ERC-1155 artwork & metadata' : 'Metadata & image compatibility'}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        {erc1155 ? (
          <>
            Each <strong className="font-medium text-slate-300">type</strong> is one token ID with shared metadata and
            image. Collectors hold <strong className="font-medium text-slate-300">copies</strong> of that type. Set
            edition size per row. You do not upload separate files per copy.
          </>
        ) : (
          <>
            Upload images in Artwork. We generate metadata JSON and public image URLs for you. Use bulk import with
            numbered <code className="text-slate-300">1.png</code> files and optional{' '}
            <code className="text-slate-300">1.json</code> for name, description, and attributes (not image URLs).
          </>
        )}
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
            <li>Square (1:1) recommended, e.g. 1024×1024</li>
            <li>
              {erc1155 ? (
                <>
                  One image per <strong className="text-slate-300">type</strong>. Bulk import{' '}
                  <code className="text-slate-300">1.png</code>, <code className="text-slate-300">2.png</code>, …
                </>
              ) : (
                <>
                  Original filename for bulk import: <code className="text-slate-300">1.png</code>,{' '}
                  <code className="text-slate-300">1.json</code>, etc.
                </>
              )}
            </li>
          </ul>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
          <h4 className="font-medium text-white">Metadata JSON</h4>
          <ul className="mt-2 list-inside list-disc space-y-1 text-slate-400">
            <li>
              Fields you set: <code className="text-slate-300">name</code>,{' '}
              <code className="text-slate-300">description</code>,{' '}
              <code className="text-slate-300">attributes</code>
            </li>
            <li>
              <code className="text-slate-300">image</code> URL is generated when you save. Do not paste your own
            </li>
            <li>Name max 80 chars · description max 2000 chars</li>
            <li>
              {erc1155
                ? 'Type IDs are 1-based (#1, #2, …). Edition size is set in the form, not in JSON.'
                : 'Token IDs are 1-based (#1, #2, …)'}
            </li>
            <li>Preview step shows the exact JSON written at publish</li>
          </ul>
        </section>
      </div>

      {erc1155 && (
        <section className="mt-3 rounded-lg border border-blue-900/40 bg-blue-950/20 p-3 text-sm">
          <h4 className="font-medium text-blue-200">How ERC-1155 differs from ERC-721</h4>
          <ul className="mt-2 list-inside list-disc space-y-1 text-blue-100/80">
            <li>One metadata URI per type. All copies share the same name, image, and traits.</li>
            <li>Edition size controls how many copies can be minted for that type.</li>
            <li>Total copies across the collection = sum of edition sizes (shown on Artwork).</li>
            <li>Random mint order does not apply. Collectors mint a chosen type and quantity.</li>
          </ul>
        </section>
      )}

      <section className="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-sm">
        <h4 className="font-medium text-amber-200">Do not put royalties in JSON</h4>
        <p className="mt-1 text-amber-100/80">
          Never include{' '}
          <code className="text-amber-100">fee_recipient</code>,{' '}
          <code className="text-amber-100">seller_fee_basis_points</code>, or similar royalty keys. Royalties are
          fixed on-chain (EIP-2981).
        </p>
      </section>

      {showIpfs && !erc1155 && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Bulk JSON files are optional. Use <code className="text-slate-400">1.json</code>,{' '}
          <code className="text-slate-400">2.json</code> for names and traits only; pair each with{' '}
          <code className="text-slate-400">1.png</code>, <code className="text-slate-400">2.png</code>, etc.
        </p>
      )}

      {showIpfs && erc1155 && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Optional <code className="text-slate-400">1.json</code> per type for name, description, and attributes only.
          Set edition size in each row after import.
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
          Example {erc1155 ? 'type' : 'token'} #1
        </a>
        {showIpfs && (
          <a
            href={IPFS_GUIDE_URL}
            download="ipfs-folder-structure.txt"
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-white"
          >
            Bulk import guide
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

