import type { CouncilStage } from './council-events.js'
import type {
  CouncilRosterEntry,
  CouncilStageRailItem,
  CouncilStageTimelineEntry,
  CouncilUxMilestone,
  CouncilUxSessionState,
} from './council-ux.js'
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
  members?: CouncilRosterEntry[]
  sessionState?: CouncilUxSessionState
  timeline?: CouncilStageTimelineEntry[]
  briefReadiness?: number
}

export function CouncilProgressPanel({
  stageItems,
  activeStage,
  latestQuestion,
  lastSummary,
  milestone,
  members = [],
  sessionState = 'idle',
  timeline = [],
  briefReadiness = 0,
}: CouncilProgressPanelProps) {
  const completedCount = stageItems.filter((item) => item.state === 'completed').length
  const stageProgress = stageItems.length > 0
    ? Math.round((completedCount / stageItems.length) * 100)
    : 0
  const debatingMembers = members.filter(
    (member) =>
      member.status === 'debating'
      || member.status === 'reviewing'
      || member.status === 'thinking',
  )
  const votingMembers = members.filter(
    (member) => member.status === 'voting' || member.status === 'done',
  )
  const waitingMembers = members.filter((member) => member.status === 'waiting')
  const failedMembers = members.filter((member) => member.status === 'error')
  const hasLiveDebate = activeStage === 'debate' || debatingMembers.length > 0
  const hasLiveVote =
    activeStage === 'vote' || votingMembers.length > 0 || sessionState === 'completed'
  const voteCompletion = members.length > 0
    ? Math.round((votingMembers.filter((member) => member.status === 'done').length / members.length) * 100)
    : 0

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
      <div className="council-progress-meter">
        <div className="council-progress-meter-head">
          <strong>Run Completion</strong>
          <span>{stageProgress}%</span>
        </div>
        <div className="council-progress-meter-track" role="progressbar" aria-valuemin={0} aria-valuenow={stageProgress} aria-valuemax={100}>
          <div className="council-progress-meter-fill" style={{ width: `${stageProgress}%` }} />
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
        <strong>Current Stage</strong>
        <span>{activeStage ? stageItems.find((item) => item.stage === activeStage)?.label : 'Waiting for the next mission.'}</span>
      </div>
      <div className="council-live-metrics">
        <div className="council-metric-tile tone-accent">
          <span>Debating</span>
          <strong>{debatingMembers.length}</strong>
        </div>
        <div className="council-metric-tile tone-good">
          <span>Voting / Done</span>
          <strong>{votingMembers.length}</strong>
        </div>
        <div className="council-metric-tile tone-warn">
          <span>Needs Input</span>
          <strong>{waitingMembers.length}</strong>
        </div>
        <div className="council-metric-tile tone-error">
          <span>Errors</span>
          <strong>{failedMembers.length}</strong>
        </div>
        <div className="council-metric-tile tone-neutral">
          <span>Brief Gate</span>
          <strong>{briefReadiness}% ready</strong>
        </div>
      </div>
      {timeline.length > 0 ? (
        <div className="council-decision-timeline">
          <div className="council-section-head">
            <strong>Decision Timeline</strong>
            <span>Stage-by-stage strategy trace</span>
          </div>
          <ul className="council-timeline-list">
            {timeline.map((entry) => (
              <li key={entry.stage}>
                <strong>{entry.label}</strong>
                <p>{entry.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {hasLiveDebate ? (
        <div className="council-debate-arena">
          <div className="council-section-head">
            <strong>Debate Arena</strong>
            <span>Live contention and tradeoff pressure</span>
          </div>
          {debatingMembers.length > 0 ? (
            <ul className="council-debate-stream">
              {debatingMembers.map((member) => (
                <li key={member.id} className={`tone-${member.tone}`}>
                  <div className="council-debate-stream-head">
                    <span className="council-activity-pip" />
                    <strong>{member.displayName}</strong>
                    <span>{member.statusLabel}</span>
                  </div>
                  <p>{member.detail || 'Comparing positions and pressure-testing assumptions.'}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="council-empty-state">
              Debate stage is active. Member signals will appear as the council forms arguments.
            </div>
          )}
        </div>
      ) : null}
      {hasLiveVote ? (
        <div className="council-vote-tracker">
          <div className="council-section-head">
            <strong>Vote Reveal</strong>
            <span>{sessionState === 'completed' ? 'Ballots finalized' : 'Ballots locking in'}</span>
          </div>
          <div className="council-vote-progress">
            <div className="council-vote-progress-track" role="progressbar" aria-valuemin={0} aria-valuenow={voteCompletion} aria-valuemax={100}>
              <div className="council-vote-progress-fill" style={{ width: `${voteCompletion}%` }} />
            </div>
            <span>{voteCompletion}% locked</span>
          </div>
          <ul className="council-vote-members">
            {members.map((member) => (
              <li
                key={member.id}
                className={`tone-${member.status === 'done' ? 'good' : member.status === 'voting' ? 'accent' : 'neutral'}`}
              >
                <strong>{member.displayName}</strong>
                <span>
                  {member.status === 'done'
                    ? 'Vote locked'
                    : member.status === 'voting'
                      ? 'Submitting ballot'
                      : 'Awaiting stage'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
