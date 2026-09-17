import { useEffect } from 'react'

/**
 * While `active` is true, remembers the element that had focus when it became active. When it
 * ends (or the component unmounts) and focus has fallen back to <body> because the focused
 * control disappeared, focus returns to that element, or to `fallbackSelector` if it is gone.
 */
export function useRestoreFocus(active: boolean, fallbackSelector: string): void {
  useEffect(() => {
    if (!active) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      requestAnimationFrame(() => {
        const current = document.activeElement
        if (current && current !== document.body) return
        const target = previous && previous !== document.body && previous.isConnected ? previous : document.querySelector<HTMLElement>(fallbackSelector)
        target?.focus()
      })
    }
  }, [active, fallbackSelector])
}
