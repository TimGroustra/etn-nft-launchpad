import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type ScrollToEndFabProps = {
  itemCount: number
  /** Only show when the list has at least this many rows. */
  minItems?: number
  /** Element id to scroll to; falls back to document bottom. */
  targetId?: string
  label?: string
}

export function ScrollToEndFab({
  itemCount,
  minItems = 10,
  targetId,
  label = 'Scroll to end of list',
}: ScrollToEndFabProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (itemCount < minItems) {
      setVisible(false)
      return
    }

    const update = () => {
      const viewport = window.innerHeight
      const docHeight = document.documentElement.scrollHeight
      const scrollable = docHeight > viewport + 80
      const nearBottom = window.scrollY + viewport >= docHeight - 140
      setVisible(scrollable && !nearBottom)
    }

    update()
    const timer = window.setTimeout(update, 100)
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [itemCount, minItems])

  const scrollToEnd = () => {
    const target = targetId ? document.getElementById(targetId) : null
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'end' })
      return
    }
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
  }

  if (!visible) return null

  return (
    <button
      type="button"
      onClick={scrollToEnd}
      aria-label={label}
      title={label}
      className={cn(
        'fixed bottom-6 left-1/2 z-40 -translate-x-1/2',
        'flex h-11 w-11 items-center justify-center rounded-full',
        'border border-slate-600 bg-slate-900/95 text-slate-100 shadow-lg backdrop-blur',
        'hover:border-blue-500 hover:bg-slate-800 hover:text-white',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
      )}
    >
      <ChevronDown className="h-6 w-6" aria-hidden />
    </button>
  )
}
