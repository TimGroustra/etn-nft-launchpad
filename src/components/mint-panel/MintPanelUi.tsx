import type { ReactNode } from 'react'
import { CardDescription, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type MintPanelAccent = 'blue' | 'violet' | 'slate'

export const mintPanelGridClass = 'grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3'

export function mintPanelCardClass({
  accent = 'blue',
  soldOut = false,
}: {
  accent?: MintPanelAccent
  soldOut?: boolean
} = {}) {
  if (soldOut) {
    return cn(
      'group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/20',
      'bg-gradient-to-b from-slate-900/40 to-slate-950/80 shadow-lg shadow-black/20',
    )
  }

  if (accent === 'violet') {
    return cn(
      'group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/30',
      'bg-gradient-to-b from-slate-900/95 via-slate-950 to-slate-950',
      'shadow-lg shadow-violet-950/20 transition duration-300',
      'hover:border-white/50 hover:shadow-xl hover:shadow-violet-950/30',
    )
  }

  return cn(
    'group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/30',
    'bg-gradient-to-b from-slate-900/90 to-slate-950',
    'shadow-lg shadow-black/30 transition duration-300',
    'hover:border-white/50 hover:shadow-xl hover:shadow-blue-950/20',
  )
}

export function mintPanelPrimaryButtonClass(accent: MintPanelAccent = 'blue') {
  if (accent === 'violet') {
    return 'w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-950/40 hover:from-violet-500 hover:to-fuchsia-500'
  }
  return 'w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-950/40 hover:from-blue-500 hover:to-cyan-500'
}

export function mintPanelSecondaryButtonClass() {
  return 'w-full border-slate-700/80'
}

type MintPanelSectionHeaderProps = {
  title: string
  description?: string
  accent?: MintPanelAccent
}

export function MintPanelSectionHeader({
  title,
  description,
  accent = 'blue',
}: MintPanelSectionHeaderProps) {
  const accentBar =
    accent === 'violet'
      ? 'from-violet-500 via-fuchsia-400 to-violet-600'
      : accent === 'slate'
        ? 'from-slate-600 via-slate-400 to-slate-600'
        : 'from-blue-500 via-cyan-400 to-blue-600'

  return (
    <div className="space-y-3 border-b border-slate-800/60 pb-5">
      <div className={cn('h-1 w-12 rounded-full bg-gradient-to-r', accentBar)} />
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h2>
        {description ? <p className="max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">{description}</p> : null}
      </div>
    </div>
  )
}

type MintPanelCardHeroProps = {
  src?: string | null
  alt: string
  fallbackLabel?: string
  accent?: MintPanelAccent
  soldOut?: boolean
}

export function MintPanelCardHero({
  src,
  alt,
  fallbackLabel,
  accent = 'blue',
  soldOut = false,
}: MintPanelCardHeroProps) {
  const glow =
    accent === 'violet'
      ? 'from-violet-600/30 via-transparent to-fuchsia-600/20'
      : 'from-blue-600/20 via-transparent to-cyan-600/10'

  return (
    <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-slate-900">
      {src ? (
        <img
          src={src}
          alt={alt}
          className={cn(
            'h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]',
            soldOut && 'opacity-55 grayscale',
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950 text-sm font-medium text-slate-500">
          {fallbackLabel ?? alt}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/25 to-transparent" />
      {!soldOut && (
        <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80', glow)} />
      )}
    </div>
  )
}

export function MintPanelCardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex min-h-0 flex-1 flex-col gap-4 p-5', className)}>{children}</div>
}

export function MintPanelCardHeader({
  title,
  badge,
  titleClassName,
}: {
  title: ReactNode
  badge?: ReactNode
  titleClassName?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <CardTitle className={cn('min-w-0 flex-1 text-xl leading-snug', titleClassName)}>{title}</CardTitle>
      {badge ? <div className="shrink-0 pt-0.5">{badge}</div> : null}
    </div>
  )
}

export function MintPanelCardDescription({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <CardDescription className={cn('line-clamp-3 min-h-[3.75rem] leading-relaxed', className)}>
      {children}
    </CardDescription>
  )
}

export function MintPanelCardActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mt-auto flex flex-col gap-3', className)}>{children}</div>
}

export function MintPanelMintSection({ children }: { children: ReactNode }) {
  return <div className="space-y-3 rounded-xl border border-slate-800/80 bg-slate-950/50 p-4">{children}</div>
}

export function MintPanelCardFooter({ children }: { children: ReactNode }) {
  return <div className="border-t border-slate-800/70 pt-4">{children}</div>
}

export function MintPanelStats({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 backdrop-blur-sm">
      <dl className="space-y-3 text-sm">{children}</dl>
    </div>
  )
}

export function MintPanelStat({
  label,
  children,
  highlight = false,
}: {
  label: string
  children: ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4',
        highlight && 'border-t border-slate-800/80 pt-3',
      )}
    >
      <dt className="text-slate-400">{label}</dt>
      <dd className={cn('text-right tabular-nums', highlight ? 'font-medium text-white' : 'text-slate-200')}>
        {children}
      </dd>
    </div>
  )
}

export function MintPanelBadge({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: 'default' | 'violet' | 'soldOut' | 'amber'
}) {
  const toneClass =
    tone === 'violet'
      ? 'border-violet-400/30 bg-violet-500/10 text-violet-200'
      : tone === 'soldOut'
        ? 'border-slate-600/80 bg-slate-900/80 text-slate-300'
        : tone === 'amber'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
          : 'border-slate-600/80 bg-slate-900/80 text-slate-300'

  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full border px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
        toneClass,
      )}
    >
      {children}
    </span>
  )
}

export function MintPanelHighlight({
  children,
  tone = 'violet',
}: {
  children: ReactNode
  tone?: 'violet' | 'amber'
}) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-500/30 bg-amber-500/10'
      : 'border-violet-500/30 bg-violet-500/10'

  return (
    <div className={cn('rounded-xl border p-4 backdrop-blur-sm', toneClass)}>{children}</div>
  )
}

export function MintPanelEmptyState({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-800/90 bg-slate-950/40 p-6 text-center sm:p-8 sm:text-left">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-400 sm:mx-0">{description}</p>
      {children ? <div className="mt-5 flex justify-center sm:justify-start">{children}</div> : null}
    </div>
  )
}
