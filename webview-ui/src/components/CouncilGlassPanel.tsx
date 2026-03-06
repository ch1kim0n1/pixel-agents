/**
 * CouncilGlassPanel — a liquid-glass-style overlay panel that slides in/out.
 * Each overlay panel can be individually toggled from the HUD.
 */

import { useEffect, useRef, useState } from 'react'
import { Icon, addCollection } from '@iconify/react'
import { icons as pixelarticonsData } from '@iconify-json/pixelarticons'

let _iconsReady = false
function ensureIcons() {
  if (_iconsReady) return
  addCollection(pixelarticonsData)
  _iconsReady = true
}

export interface CouncilGlassPanelProps {
  /** Panel is open / visible */
  open: boolean
  /** Called when user clicks the close button inside the panel */
  onClose: () => void
  /** Short title shown in the panel header */
  title: string
  /** Icon for the panel header */
  icon: string
  /** Optional accent colour for the header border */
  accent?: string
  children: React.ReactNode
  /** CSS class applied to the panel root — use to control position/width */
  className?: string
}

export function CouncilGlassPanel({
  open,
  onClose,
  title,
  icon,
  accent,
  children,
  className,
}: CouncilGlassPanelProps) {
  ensureIcons()

  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // open: mount then animate in
  useEffect(() => {
    if (open) {
      setMounted(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    } else {
      setVisible(false)
    }
  }, [open])

  // after fade-out animation completes, unmount
  const handleTransitionEnd = () => {
    if (!visible) setMounted(false)
  }

  if (!mounted) return null

  return (
    <div
      ref={panelRef}
      className={[
        'cgp-panel',
        visible ? 'cgp-panel--visible' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={accent ? ({ '--cgp-accent': accent } as React.CSSProperties) : undefined}
      onTransitionEnd={handleTransitionEnd}
    >
      {/* glass shimmer lines */}
      <div className="cgp-glass-shimmer" aria-hidden />

      <header className="cgp-header">
        <Icon icon={icon} width={14} height={14} className="cgp-header-icon" />
        <span className="cgp-header-title">{title}</span>
        <button
          type="button"
          className="cgp-close"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          <Icon icon="pixelarticons:close" width={12} height={12} />
        </button>
      </header>

      <div className="cgp-body">{children}</div>
    </div>
  )
}

// ─── Panel toggle button used in the HUD ────────────────────────────────────

export interface CouncilPanelToggleProps {
  icon: string
  label: string
  active: boolean
  onClick: () => void
  accent?: string
}

export function CouncilPanelToggle({
  icon,
  label,
  active,
  onClick,
  accent,
}: CouncilPanelToggleProps) {
  ensureIcons()
  return (
    <button
      type="button"
      className={['cpt-btn', active ? 'cpt-btn--active' : ''].filter(Boolean).join(' ')}
      style={accent ? ({ '--cpt-accent': accent } as React.CSSProperties) : undefined}
      onClick={onClick}
      title={label}
      aria-pressed={active}
    >
      <Icon icon={icon} width={14} height={14} />
      <span>{label}</span>
    </button>
  )
}
