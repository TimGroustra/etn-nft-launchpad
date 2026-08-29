import * as React from 'react'
import { cn } from '@/lib/utils'

type TabsContextValue = { value: string; onChange: (v: string) => void }
const TabsContext = React.createContext<TabsContextValue | null>(null)

export function Tabs({
  value,
  onValueChange,
  className,
  children,
}: {
  value: string
  onValueChange: (v: string) => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <TabsContext.Provider value={{ value, onChange: onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex gap-1 rounded-lg bg-slate-900 p-1', className)}>{children}</div>
}

export function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children: React.ReactNode
}) {
  const ctx = React.useContext(TabsContext)
  const active = ctx?.value === value
  return (
    <button
      type="button"
      onClick={() => ctx?.onChange(value)}
      className={cn(
        'flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors',
        active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children: React.ReactNode
}) {
  const ctx = React.useContext(TabsContext)
  if (ctx?.value !== value) return null
  return <div className={className}>{children}</div>
}
