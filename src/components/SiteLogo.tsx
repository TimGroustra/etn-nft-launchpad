import { Link } from 'react-router-dom'

type SiteLogoProps = {
  className?: string
}

export function SiteLogo({ className = 'h-8 w-8' }: SiteLogoProps) {
  return (
    <Link
      to="/"
      className="flex shrink-0 items-center rounded-md p-1 transition-colors hover:bg-slate-900"
      aria-label="ETN NFT Launchpad home"
    >
      <img
        src="/brand/logo-blue-64.png"
        srcSet="/brand/logo-blue-64.png 1x, /brand/logo-blue-128.png 2x"
        alt=""
        className={`${className} object-contain`}
        width={32}
        height={32}
        decoding="async"
      />
    </Link>
  )
}
