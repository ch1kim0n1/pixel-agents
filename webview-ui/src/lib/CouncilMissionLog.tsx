import type { CouncilStage } from './council-events.js'
import type { CouncilMissionLogEntry, CouncilRosterEntry, CouncilStageTimelineEntry } from './council-ux.js'

export interface CouncilMissionLogProps {
  entries: CouncilMissionLogEntry[]
  emptyText: string
  activeStage?: CouncilStage | null
  members?: CouncilRosterEntry[]
  timeline?: CouncilStageTimelineEntry[]
}

export function CouncilMissionLog({
  entries,
  emptyText,
  activeStage = null,
  members = [],
  timeline = [],
}: CouncilMissionLogProps) {
  const activeMembers = members.filter((member) => member.status !== 'idle').length
  const waitingMembers = members.filter((member) => member.status === 'waiting').length
  const failedMembers = members.filter((member) => member.status === 'error').length

  return (
    <section className="council-surface-panel council-mission-log">
      <div className="council-panel-heading">
        <span className="council-kicker">Mission Log</span>
        <h2>Recent Events</h2>
        <p>Keep the feed readable by emphasizing meaning over raw transport noise.</p>
      </div>
      <div className="council-log-meta">
        <span>{activeStage ? `Stage: ${activeStage.replaceAll('_', ' ')}` : 'Stage: standby'}</span>
        <span>Active members: {activeMembers}</span>
        <span>Waiting: {waitingMembers}</span>
        <span>Errors: {failedMembers}</span>
      </div>
      {timeline.length > 0 ? (
        <div className="council-log-timeline-strip">
          {timeline.map((entry) => (
            <article key={entry.stage}>
              <strong>{entry.label}</strong>
              <span>{entry.summary}</span>
            </article>
          ))}
        </div>
      ) : null}
      {entries.length === 0 ? (
        <div className="council-empty-state">{emptyText}</div>
      ) : (
        <ul className="council-mission-log-list">
          {entries.map((entry, index) => (
            <li key={entry.id} className={`tone-${entry.tone}`}>
              <span className="council-log-index">#{String(entries.length - index).padStart(2, '0')}</span>
              <span>{entry.label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
