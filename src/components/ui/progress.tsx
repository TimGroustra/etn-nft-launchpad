import * as React from 'react'
import { cn } from '@/lib/utils'

export function Progress({ className, value = 0, ...props }: React.HTMLAttributes<HTMLDivElement> & { value?: number }) {
  return (
    <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-slate-800', className)} {...props}>
      <div
        className="h-full bg-cyan-500 transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
