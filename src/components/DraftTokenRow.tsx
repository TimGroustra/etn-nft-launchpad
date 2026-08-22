import { useEffect, useState } from 'react'
import { Input, Textarea } from '@/components/ui/input'
import { FieldError } from '@/components/form-fields'
import { TokenAttributesEditor } from '@/components/TokenAttributesEditor'
import type { DraftToken } from '@/lib/create-collection-validation'
import { getRowTokenId } from '@/lib/draft-token-rows'
import { getPublicImageUrl } from '@/lib/supabase'

type DraftTokenRowProps = {
  token: DraftToken
  rowIndex: number
  fieldErrors: Record<string, string>
  onChange: (token: DraftToken) => void
}

export function DraftTokenRow({ token, rowIndex, fieldErrors, onChange }: DraftTokenRowProps) {
  const tokenNum = getRowTokenId(token, rowIndex)
  const fieldPrefix = `token.${tokenNum}`
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (token.file) {
      const url = URL.createObjectURL(token.file)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    if (token.existingImagePath) {
      setPreviewUrl(getPublicImageUrl(token.existingImagePath))
      return
    }
    setPreviewUrl(null)
  }, [token.file, token.existingImagePath])

  return (
    <div className="space-y-3 rounded-lg border border-slate-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Token #{tokenNum}</p>
        {previewUrl && (
          <img
            src={previewUrl}
            alt={token.name || `Token ${tokenNum}`}
            className="h-16 w-16 shrink-0 rounded-lg border border-slate-700 object-cover"
          />
        )}
      </div>
      <Input
        value={token.name}
        onChange={(e) => onChange({ ...token, name: e.target.value })}
        placeholder="Token name"
      />
      <FieldError message={fieldErrors[`${fieldPrefix}.name`]} />
      <Textarea
        value={token.description}
        onChange={(e) => onChange({ ...token, description: e.target.value })}
        placeholder="Description (optional)"
      />
      <FieldError message={fieldErrors[`${fieldPrefix}.description`]} />
      <div className="space-y-1">
        <Input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => onChange({ ...token, file: e.target.files?.[0] ?? null })}
        />
        {token.file && (
          <p className="text-xs text-slate-500">
            Selected: {token.file.name}
            {token.existingImagePath ? ' (replaces saved image on save)' : ''}
          </p>
        )}
        {!token.file && token.existingImagePath && (
          <p className="text-xs text-slate-500">Using saved image from draft</p>
        )}
      </div>
      <FieldError message={fieldErrors[`${fieldPrefix}.image`]} />
      <TokenAttributesEditor
        attributes={token.attributes}
        onChange={(attributes) => onChange({ ...token, attributes })}
        error={fieldErrors[`${fieldPrefix}.attributes`]}
      />
    </div>
  )
}
