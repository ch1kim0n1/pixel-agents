import type { CouncilRosterEntry } from './council-ux.js'

export interface CouncilRosterPanelProps {
  members: CouncilRosterEntry[]
  selectedMemberId: string | null
  onSelect: (memberId: string) => void
}

export function CouncilRosterPanel({
  members,
  selectedMemberId,
  onSelect,
}: CouncilRosterPanelProps) {
  const selected = members.find((entry) => entry.id === selectedMemberId) ?? null

  return (
    <section className="council-surface-panel council-roster-panel">
      <div className="council-panel-heading">
        <span className="council-kicker">Council Members</span>
        <h2>Roster</h2>
        <p>Pin the chairman first and make each member’s live task visible at a glance.</p>
      </div>
      <div className="council-roster-list">
        {members.length === 0 ? <div className="council-empty-state">No council members are active yet.</div> : null}
        {members.map((member) => (
          <button
            key={member.id}
            type="button"
            className={`council-roster-item tone-${member.tone} ${selectedMemberId === member.id ? 'is-selected' : ''}`}
            onClick={() => onSelect(member.id)}
          >
            <div className="council-roster-title">
              <strong>{member.displayName}</strong>
              <span>{member.role === 'chairman' ? 'Lead Synth' : 'Council Member'}</span>
            </div>
            <div className="council-roster-status">
              {member.statusLabel}
              {member.detail ? `: ${member.detail}` : ''}
            </div>
            {member.personaName ? (
              <div className="council-roster-persona">
                {member.personaName}
                {member.personaSummary ? ` - ${member.personaSummary}` : ''}
              </div>
            ) : null}
          </button>
        ))}
      </div>
      {selected ? (
        <div className="council-selected-card">
          <strong>Focused Member</strong>
          <span>{selected.displayName}</span>
          <p>
            {selected.detail
              || (selected.role === 'chairman'
                ? 'The chairman will consolidate the winning position into the final synthesis.'
                : 'This member is ready for the next council event.')}
          </p>
        </div>
      ) : null}
    </section>
  )
}
