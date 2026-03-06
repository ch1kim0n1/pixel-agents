import type { CouncilMissionLogEntry } from './council-ux.js'

export interface CouncilMissionLogProps {
  entries: CouncilMissionLogEntry[]
  emptyText: string
}

export function CouncilMissionLog({
  entries,
  emptyText,
}: CouncilMissionLogProps) {
  return (
    <section className="council-surface-panel council-mission-log">
      <div className="council-panel-heading">
        <span className="council-kicker">Mission Log</span>
        <h2>Recent Events</h2>
        <p>Keep the feed readable by emphasizing meaning over raw transport noise.</p>
      </div>
      {entries.length === 0 ? (
        <div className="council-empty-state">{emptyText}</div>
      ) : (
        <ul className="council-mission-log-list">
          {entries.map((entry) => (
            <li key={entry.id} className={`tone-${entry.tone}`}>
              {entry.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
