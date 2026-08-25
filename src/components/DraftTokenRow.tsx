import { useEffect, useState } from 'react'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/input'
import { FieldError, FieldHint } from '@/components/form-fields'
import { TokenAttributesEditor } from '@/components/TokenAttributesEditor'
import type { DraftToken } from '@/lib/create-collection-validation'
import { getRowTokenId } from '@/lib/draft-token-rows'
import { getPublicImageUrl } from '@/lib/supabase'
import { getTypeRowLabel, isErc1155, type TokenStandard } from '@/lib/token-standard-ui'

type DraftTokenRowProps = {
  token: DraftToken
  rowIndex: number
  fieldErrors: Record<string, string>
  onChange: (token: DraftToken) => void
  disabled?: boolean
  tokenStandard?: TokenStandard
}

export function DraftTokenRow({
  token,
  rowIndex,
  fieldErrors,
  onChange,
  disabled = false,
  tokenStandard = 'erc721',
}: DraftTokenRowProps) {
  const tokenNum = getRowTokenId(token, rowIndex)
  const fieldPrefix = `token.${tokenNum}`
  const erc1155 = isErc1155(tokenStandard)
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
    <div className={`space-y-3 rounded-lg border border-slate-800 p-4 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {getTypeRowLabel(tokenStandard, tokenNum)}
          </p>
          {erc1155 && (
            <FieldHint>One shared metadata URI for every copy of this type.</FieldHint>
          )}
        </div>
        {previewUrl && (
          <img
            src={previewUrl}
            alt={token.name || `${erc1155 ? 'Type' : 'Token'} ${tokenNum}`}
            className="h-16 w-16 shrink-0 rounded-lg border border-slate-700 object-cover"
          />
        )}
      </div>
      <Input
        value={token.name}
        onChange={(e) => onChange({ ...token, name: e.target.value })}
        placeholder={erc1155 ? 'Type name (shown on every copy)' : 'Token name'}
        disabled={disabled}
      />
      <FieldError message={fieldErrors[`${fieldPrefix}.name`]} />
      <Textarea
        value={token.description}
        onChange={(e) => onChange({ ...token, description: e.target.value })}
        placeholder="Description (optional)"
        disabled={disabled}
      />
      <FieldError message={fieldErrors[`${fieldPrefix}.description`]} />
      {erc1155 && (
        <div>
          <Label>Edition size</Label>
          <Input
            type="number"
            min={1}
            value={token.editionSize ?? 1}
            onChange={(e) =>
              onChange({ ...token, editionSize: Math.max(1, Number(e.target.value) || 1) })
            }
            disabled={disabled}
          />
          <FieldHint>How many copies of this type can be minted. All copies share this row&apos;s image and metadata.</FieldHint>
          <FieldError message={fieldErrors[`${fieldPrefix}.editionSize`]} />
        </div>
      )}
      <div className="space-y-1">
        <Label>{erc1155 ? 'Artwork image' : 'Image'}</Label>
        <Input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => onChange({ ...token, file: e.target.files?.[0] ?? null })}
          disabled={disabled}
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
