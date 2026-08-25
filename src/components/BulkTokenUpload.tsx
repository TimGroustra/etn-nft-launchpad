import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { DraftToken } from '@/lib/create-collection-validation'
import type { TokenStandard } from '@/lib/token-standard-ui'
import { isErc1155 } from '@/lib/token-standard-ui'
import { importBulkTokenFiles } from '@/lib/bulk-token-import'

type BulkTokenUploadProps = {
  maxSupply: number
  onImport: (tokens: DraftToken[]) => void
  disabled?: boolean
  tokenStandard?: TokenStandard
}

export function BulkTokenUpload({
  maxSupply,
  onImport,
  disabled = false,
  tokenStandard = 'erc721',
}: BulkTokenUploadProps) {
  const folderInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return
    setImporting(true)
    try {
      const result = await importBulkTokenFiles([...fileList], maxSupply)
      for (const warning of result.warnings) toast.message(warning)
      if (result.errors.length > 0) {
        toast.error(result.errors[0])
        if (result.errors.length > 1) {
          toast.message(`${result.errors.length - 1} more issue(s) — check file naming and JSON format.`)
        }
        return
      }
      onImport(result.tokens)
      toast.success(
        isErc1155(tokenStandard)
          ? `Imported ${result.tokens.length} type(s) — set edition size per row`
          : `Imported ${result.tokens.length} token(s) into editable rows`,
      )
    } finally {
      setImporting(false)
      if (folderInputRef.current) folderInputRef.current.value = ''
      if (filesInputRef.current) filesInputRef.current.value = ''
    }
  }

  return (
    <div className={`rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 space-y-3 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      <div>
        <p className="font-medium text-white">Bulk upload</p>
        <p className="mt-1 text-sm text-slate-400">
          {isErc1155(tokenStandard) ? (
            <>
              Upload numbered pairs per <strong className="text-slate-300">type</strong>:{' '}
              <code className="text-slate-300">1.png</code> + optional <code className="text-slate-300">1.json</code>,{' '}
              <code className="text-slate-300">2.png</code> + optional <code className="text-slate-300">2.json</code>,
              etc. Edition size is set per row after import — not one file per copy.
            </>
          ) : (
            <>
              Upload a folder or file set with numbered pairs: <code className="text-slate-300">1.png</code> +{' '}
              <code className="text-slate-300">1.json</code>, <code className="text-slate-300">2.png</code> +{' '}
              <code className="text-slate-300">2.json</code>, etc. JSON is validated against our metadata rules before
              import.
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={importing || disabled}
          onClick={() => folderInputRef.current?.click()}
        >
          {importing ? 'Importing…' : 'Choose folder'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={importing || disabled}
          onClick={() => filesInputRef.current?.click()}
        >
          Choose files
        </Button>
      </div>

      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        // @ts-expect-error webkitdirectory is supported in Chromium browsers
        webkitdirectory=""
        multiple
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={filesInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,application/json,.json"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}
