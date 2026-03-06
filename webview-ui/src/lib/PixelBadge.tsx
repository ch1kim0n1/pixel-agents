import { Icon, addCollection } from '@iconify/react'
import { icons as pixelarticons } from '@iconify-json/pixelarticons'

let initialized = false

function ensurePixelarticonsRegistered(): void {
  if (initialized) return
  addCollection(pixelarticons)
  initialized = true
}

export interface PixelBadgeProps {
  icon: string
  label: string
  tone?: 'neutral' | 'good' | 'warn' | 'accent'
}

export function PixelBadge({
  icon,
  label,
  tone = 'neutral',
}: PixelBadgeProps) {
  ensurePixelarticonsRegistered()

  return (
    <span className={`pixel-badge tone-${tone}`}>
      <Icon icon={icon} width={16} height={16} />
      <span>{label}</span>
    </span>
  )
}
