import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

/** Block in-app navigation and tab close while a long operation is running. */
export function useNavigationGuard(active: boolean, message = 'Your collection is still saving. Leave anyway?') {
  const blocker = useBlocker(active)

  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = message
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active, message])

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    const leave = window.confirm(message)
    if (leave) blocker.proceed()
    else blocker.reset()
  }, [blocker, message])
}
