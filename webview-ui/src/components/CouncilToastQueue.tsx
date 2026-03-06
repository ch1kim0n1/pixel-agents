/**
 * CouncilToastQueue — renders the active toast stack.
 * The hook lives in hooks/useCouncilToasts.ts.
 */

import { CouncilStageToast } from './CouncilStageToast.js'
import type { CouncilToastData } from './councilToastFactories.js'

export type { CouncilToastData }

// ─── Renderer ───────────────────────────────────────────────────────────────

export interface CouncilToastQueueProps {
  toasts: CouncilToastData[]
  onDismiss: (id: string) => void
}

export function CouncilToastQueue({ toasts, onDismiss }: CouncilToastQueueProps) {
  if (toasts.length === 0) return null

  return (
    <div className="cst-queue" aria-label="Council notifications">
      {toasts.map((toast) => (
        <CouncilStageToast key={toast.id} data={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
