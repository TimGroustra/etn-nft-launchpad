import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { Button } from '@/components/ui/button'

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('error loading dynamically imported module')
  )
}

export function RouteError() {
  const error = useRouteError()
  const staleDeploy = isChunkLoadError(error)

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold text-white">
        {staleDeploy ? 'A new version is available' : 'Something went wrong'}
      </h1>
      <p className="max-w-md text-sm text-slate-400">
        {staleDeploy
          ? 'The app was updated while this tab was open. Refresh to load the latest version.'
          : isRouteErrorResponse(error)
            ? error.statusText || 'Unexpected error'
            : error instanceof Error
              ? error.message
              : 'Unexpected error'}
      </p>
      <Button type="button" onClick={() => window.location.reload()}>
        Refresh page
      </Button>
    </div>
  )
}
