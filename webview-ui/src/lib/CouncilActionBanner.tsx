import type { CouncilActionBannerCopy } from './council-ux.js'
import { PixelBadge } from './PixelBadge.js'

export interface CouncilActionBannerProps {
  copy: CouncilActionBannerCopy
  onAction?: () => void
  actionDisabled?: boolean
}

export function CouncilActionBanner({
  copy,
  onAction,
  actionDisabled = false,
}: CouncilActionBannerProps) {
  const badges = [
    { icon: 'pixelarticons:briefcase', label: 'Mission', tone: 'neutral' as const },
    {
      icon: copy.tone === 'error' ? 'pixelarticons:alert' : copy.tone === 'good' ? 'pixelarticons:check-double' : 'pixelarticons:clock',
      label: copy.tone === 'error' ? 'Attention' : copy.tone === 'good' ? 'Ready' : 'Live',
      tone: copy.tone === 'error' ? 'warn' as const : copy.tone === 'good' ? 'good' as const : 'accent' as const,
    },
    { icon: 'pixelarticons:chart-bar', label: 'Telemetry', tone: 'accent' as const },
  ]

  return (
    <section className={`council-surface-panel council-action-banner tone-${copy.tone}`}>
      <div className="council-action-banner-copy">
        <span className="council-kicker">Next Action</span>
        <h2>{copy.title}</h2>
        <p>{copy.description}</p>
        <div className="pixel-badge-row">
          {badges.map((badge) => (
            <PixelBadge
              key={`${badge.icon}-${badge.label}`}
              icon={badge.icon}
              label={badge.label}
              tone={badge.tone}
            />
          ))}
        </div>
      </div>
      {copy.actionLabel && onAction ? (
        <button
          type="button"
          className="council-action-banner-button"
          onClick={onAction}
          disabled={actionDisabled}
        >
          {copy.actionLabel}
        </button>
      ) : null}
    </section>
  )
}
