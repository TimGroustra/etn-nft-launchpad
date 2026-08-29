import * as React from 'react'
import { cn } from '@/lib/utils'

export function Alert({
  className,
  variant,
  children,
}: {
  className?: string
  variant?: 'destructive'
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        variant === 'destructive' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-slate-700 bg-slate-900',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function AlertTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('font-semibold', className)}>{children}</div>
}

export function AlertDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('text-sm opacity-90', className)}>{children}</div>
}

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export function Tooltip({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export function TooltipTrigger({ asChild: _asChild, children }: { asChild?: boolean; children: React.ReactNode }) {
  return <>{children}</>
}

export function TooltipContent({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 text-[10px] text-slate-400" title={typeof children === 'string' ? children : undefined}>
      {children}
    </span>
  )
}
