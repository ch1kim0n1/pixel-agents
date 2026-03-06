import type { CouncilStage } from './council-events.js'
import type { CouncilStageRailItem, CouncilUxMilestone } from './council-ux.js'
import { PixelBadge } from './PixelBadge.js'

const MILESTONE_COPY: Record<Exclude<CouncilUxMilestone, 'none'>, string> = {
  flawless: 'Flawless Run',
  clarified: 'Clarified Path',
  interrupted: 'Interrupted Mission',
}

export interface CouncilProgressPanelProps {
  stageItems: CouncilStageRailItem[]
  activeStage: CouncilStage | null
  latestQuestion?: string | null
  lastSummary?: string | null
  milestone: CouncilUxMilestone
}

export function CouncilProgressPanel({
  stageItems,
  activeStage,
  latestQuestion,
  lastSummary,
  milestone,
}: CouncilProgressPanelProps) {
  return (
    <section className="council-surface-panel council-progress-panel">
      <div className="council-panel-heading">
        <span className="council-kicker">Quest Progress</span>
        <h2>Live Council Arena</h2>
        <p>Make the process legible while the room moves from first opinions to final synthesis.</p>
        <div className="pixel-badge-row">
          <PixelBadge icon="pixelarticons:chart-bar-big" label="Stages" tone="accent" />
          <PixelBadge icon="pixelarticons:message" label="Debate Feed" tone="neutral" />
          <PixelBadge icon="pixelarticons:shield" label="Decision Integrity" tone="good" />
        </div>
      </div>
      <div className="council-stage-rail">
        {stageItems.map((item) => (
          <div
            key={item.stage}
            className={`council-stage-chip is-${item.state}`}
          >
            {item.label}
          </div>
        ))}
      </div>
      <div className="council-progress-summary">
        <strong>{activeStage ? 'Current Stage' : 'Current Stage'}</strong>
        <span>{activeStage ? stageItems.find((item) => item.stage === activeStage)?.label : 'Waiting for the next mission.'}</span>
      </div>
      {milestone !== 'none' ? (
        <div className={`council-milestone-badge tone-${milestone === 'interrupted' ? 'error' : milestone === 'clarified' ? 'warn' : 'good'}`}>
          {MILESTONE_COPY[milestone]}
        </div>
      ) : null}
      {latestQuestion ? (
        <div className="council-highlight-box tone-warn">
          <strong>Clarification Request</strong>
          <span>{latestQuestion}</span>
        </div>
      ) : null}
      {lastSummary ? (
        <div className="council-highlight-box tone-good">
          <strong>Latest Synthesis</strong>
          <span>{lastSummary}</span>
        </div>
      ) : null}
    </section>
  )
}
