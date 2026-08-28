import { useEffect, useRef, useState } from 'react'

type UseLazyInViewOptions = {
  rootMargin?: string
  threshold?: number
}

/** Activates once when the element enters (or nears) the viewport — stays true after. */
export function useLazyInView(options: UseLazyInViewOptions = {}) {
  const { rootMargin = '200px', threshold = 0 } = options
  const ref = useRef<HTMLElement>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    if (isInView) return

    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { rootMargin, threshold },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [isInView, rootMargin, threshold])

  return { ref, isInView }
}
