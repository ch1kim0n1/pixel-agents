/**
 * CouncilStageToast — per-stage animated popup notification component.
 * Types and factory functions live in councilToastFactories.ts.
 */

import { useEffect, useRef, useState } from 'react'
import { Icon, addCollection } from '@iconify/react'
import { icons as pixelarticonsData } from '@iconify-json/pixelarticons'
import { TOAST_SPECS, type CouncilToastData } from './councilToastFactories.js'

let _iconsReady = false
function ensureIcons() {
  if (_iconsReady) return
  addCollection(pixelarticonsData)
  _iconsReady = true
}

// ─── Component ─────────────────────────────────────────────────────────────

export interface CouncilStageToastProps {
  data: CouncilToastData
  onDismiss: (id: string) => void
}

export function CouncilStageToast({ data, onDismiss }: CouncilStageToastProps) {
  ensureIcons()

  const spec = TOAST_SPECS[data.kind]
  const icon = data.icon ?? spec.icon
  const isHero = spec.size === 'hero'

  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit'>('enter')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // enter → visible
  useEffect(() => {
    const t = setTimeout(() => setPhase('visible'), 20)
    return () => clearTimeout(t)
  }, [])

  // auto-dismiss
  useEffect(() => {
    const duration = data.duration ?? (isHero ? 5500 : 4000)
    if (duration === 0) return
    timerRef.current = setTimeout(() => setPhase('exit'), duration)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [data.duration, isHero])

  // when exit anim ends, call onDismiss
  const handleAnimDone = () => {
    if (phase === 'exit') onDismiss(data.id)
  }

  const handleClose = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPhase('exit')
  }

  return (
    <div
      className={[
        'cst-toast',
        `cst-toast--${data.kind}`,
        `cst-toast--${spec.animate}`,
        isHero ? 'cst-toast--hero' : '',
        `cst-toast--${phase}`,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        '--cst-accent': spec.accent,
        '--cst-glow': spec.glowColor,
        '--cst-label': spec.labelColor,
      } as React.CSSProperties}
      onTransitionEnd={handleAnimDone}
      role="status"
      aria-live="polite"
    >
      {/* scanline overlay for flash-kinds */}
      <div className="cst-scanline" />

      {/* icon badge */}
      <div className="cst-icon-wrap">
        <Icon icon={icon} width={isHero ? 28 : 20} height={isHero ? 28 : 20} />
      </div>

      {/* text */}
      <div className="cst-body">
        <span className="cst-title">{data.title}</span>
        {data.subtitle && <span className="cst-subtitle">{data.subtitle}</span>}
      </div>

      {/* close button */}
      <button
        type="button"
        className="cst-close"
        aria-label="Dismiss"
        onClick={handleClose}
      >
        <Icon icon="pixelarticons:close" width={12} height={12} />
      </button>
    </div>
  )
}
