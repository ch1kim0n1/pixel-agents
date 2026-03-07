import type { ReactNode } from 'react'
import { useState } from 'react'

export interface CouncilLaunchAction {
  label: string
  onClick: () => void
  disabled?: boolean
}

export interface CouncilLaunchCardProps {
  title: string
  description: string
  promptLabel: string
  promptValue: string
  onPromptChange: (value: string) => void
  promptPlaceholder: string
  helperText: string
  primaryAction: CouncilLaunchAction
  secondaryAction?: CouncilLaunchAction
  advancedContent?: ReactNode
  topSlot?: ReactNode
}

export function CouncilLaunchCard({
  title,
  description,
  promptLabel,
  promptValue,
  onPromptChange,
  promptPlaceholder,
  helperText,
  primaryAction,
  secondaryAction,
  advancedContent,
  topSlot,
}: CouncilLaunchCardProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)

  return (
    <section className="council-surface-panel council-launch-card">
      <div className="council-panel-heading">
        <span className="council-kicker">Mission Launcher</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="council-query-entry">
        <div className="council-query-entry-head">
          <span className="council-query-entry-kicker">Primary Input</span>
          <strong>Send The Council Query</strong>
          <p>This message is sent to the AI council and becomes the starting point for the debate session.</p>
        </div>
        <label className="council-field council-query-field">
          <span>{promptLabel}</span>
          <textarea
            value={promptValue}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder={promptPlaceholder}
          />
        </label>
        <p className="council-helper-text">{helperText}</p>
      </div>
      {topSlot}
      <div className="council-action-row">
        <button
          type="button"
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled}
        >
          {primaryAction.label}
        </button>
        {secondaryAction ? (
          <button
            type="button"
            className="is-secondary"
            onClick={secondaryAction.onClick}
            disabled={secondaryAction.disabled}
          >
            {secondaryAction.label}
          </button>
        ) : null}
        {advancedContent ? (
          <button
            type="button"
            className="is-secondary"
            onClick={() => setAdvancedOpen((current) => !current)}
          >
            {advancedOpen ? 'Hide Advanced' : 'Show Advanced'}
          </button>
        ) : null}
      </div>
      {advancedContent && advancedOpen ? (
        <div className="council-advanced-panel">
          {advancedContent}
        </div>
      ) : null}
    </section>
  )
}
