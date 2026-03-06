import { useCallback, useState } from 'react'
import type { CouncilToastData } from '../components/councilToastFactories.js'

export function useCouncilToasts() {
  const [toasts, setToasts] = useState<CouncilToastData[]>([])

  const push = useCallback((toast: CouncilToastData | null) => {
    if (!toast) return
    setToasts((prev) => {
      // De-duplicate: replace an existing toast of the same kind unless it's sticky
      if (toast.duration !== 0) {
        const filtered = prev.filter((t) => t.kind !== toast.kind)
        return [...filtered, toast]
      }
      return [...prev, toast]
    })
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const clear = useCallback(() => setToasts([]), [])

  return { toasts, push, dismiss, clear }
}
