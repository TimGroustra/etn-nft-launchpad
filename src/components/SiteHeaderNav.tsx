import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAdmin } from '@/hooks/useAdmin'
import { canViewGallery } from '@/lib/gallery-access'

const NAV_LINK_BASE =
  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `${NAV_LINK_BASE} ${
    isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
  }`

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
    isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
  }`

type NavItem = {
  to: string
  label: string
  end?: boolean
}

export function SiteHeaderNav() {
  const location = useLocation()
  const { address } = useAccount()
  const { isAdmin } = useAdmin()
  const showGalleryNav = canViewGallery(address, isAdmin)
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })

  const items = useMemo((): NavItem[] => {
    const base: NavItem[] = [
      { to: '/', label: 'Mint', end: true },
      { to: '/dashboard', label: 'Dashboard' },
    ]
    if (showGalleryNav) base.push({ to: '/gallery', label: '3D Gallery' })
    return base
  }, [showGalleryNav])

  const checkFit = useCallback(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return
    // Compare against stable parent width — container shrinks when collapsed and can oscillate.
    const availableWidth = container.parentElement?.clientWidth ?? container.clientWidth
    const shouldCollapse = measure.scrollWidth > availableWidth
    setCollapsed((prev) => (prev === shouldCollapse ? prev : shouldCollapse))
  }, [items])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => checkFit())
    observer.observe(container)
    checkFit()

    return () => observer.disconnect()
  }, [checkFit])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return

    const updateMenuPosition = () => {
      const button = menuButtonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
      })
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const openMenu = () => {
    const button = menuButtonRef.current
    if (button) {
      const rect = button.getBoundingClientRect()
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
      })
    }
    setMenuOpen(true)
  }

  const toggleMenu = () => {
    if (menuOpen) {
      setMenuOpen(false)
      return
    }
    openMenu()
  }

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <div
        ref={measureRef}
        className="pointer-events-none invisible absolute left-0 top-0 flex gap-1"
        aria-hidden
      >
        {items.map((item) => (
          <span key={item.to} className={`${NAV_LINK_BASE} text-slate-400`}>
            {item.label}
          </span>
        ))}
      </div>

      {collapsed ? (
        <>
          <div ref={menuButtonRef} className="inline-flex">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 px-0"
              aria-expanded={menuOpen}
              aria-controls="site-header-nav-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={toggleMenu}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-[90]"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />
              <nav
                id="site-header-nav-menu"
                className="fixed z-[100] min-w-[10rem] rounded-lg border border-slate-800 bg-slate-950 p-1 shadow-lg"
                style={{ top: menuPosition.top, left: menuPosition.left }}
              >
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={mobileNavLinkClass}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </>
          )}
        </>
      ) : (
        <nav className="flex flex-nowrap items-center gap-1">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
