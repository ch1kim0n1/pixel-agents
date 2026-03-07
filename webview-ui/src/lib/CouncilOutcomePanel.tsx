import type { CouncilStage } from './council-events.js'
import type { CouncilOutcomeSummary, CouncilRosterEntry, CouncilRunHistoryEntry } from './council-ux.js'

export interface CouncilOutcomePanelProps {
  outcome: CouncilOutcomeSummary | null
  emptyText: string
  activeStage?: CouncilStage | null
  members?: CouncilRosterEntry[]
  runHistory?: CouncilRunHistoryEntry[]
}

export function CouncilOutcomePanel({
  outcome,
  emptyText,
  activeStage = null,
  members = [],
  runHistory = [],
}: CouncilOutcomePanelProps) {
  const scoreWidth = (value: number) => `${Math.max(0, Math.min(100, value * 10))}%`
  const formatCompletedAt = (value: string) => {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return value
    }
    return parsed.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  const rankings = outcome
    ? outcome.optionRankings.map((ranking, index) => {
      const matchedOption = outcome.options.find(
        (option) => option.id === ranking.optionId || option.label === ranking.label,
      )
      const averageRank = typeof ranking.averageRank === 'number' ? ranking.averageRank : null
      const firstChoiceVotes = typeof ranking.firstChoiceVotes === 'number' ? ranking.firstChoiceVotes : null
      const rankingCount = typeof ranking.rankingsCount === 'number' ? ranking.rankingsCount : null

      return {
        id: ranking.optionId || ranking.label || `${index}`,
        label: ranking.label,
        title: ranking.title || matchedOption?.title || 'Untitled option',
        summary: matchedOption?.summary || '',
        averageRank,
        firstChoiceVotes,
        rankingCount,
        isWinner:
          outcome.winningOption?.id === ranking.optionId
          || outcome.winningOption?.label === ranking.label,
      }
    })
    : []

  const maxFirstChoiceVotes = rankings.reduce((max, row) => Math.max(max, row.firstChoiceVotes ?? 0), 0)
  const liveVotingMembers = members.filter(
    (member) => member.status === 'voting' || member.status === 'done',
  )
  const votingInProgress = activeStage === 'options' || activeStage === 'vote'
  const strategyPacket = outcome?.strategyPacket ?? null

  return (
    <section className="council-surface-panel council-outcome-panel">
      <div className="council-panel-heading">
        <span className="council-kicker">Decision Deck</span>
        <h2>Final Outcome</h2>
        <p>Lead with the synthesis, then show the winning option and supporting references.</p>
      </div>
      {outcome ? (
        <div className="council-outcome-stack">
          <div className="council-highlight-box tone-good">
            <strong>Final Synthesis</strong>
            <span>{outcome.finalResponse || 'No final synthesis was returned.'}</span>
          </div>
          {outcome.winningOption ? (
            <div className="council-outcome-winner">
              <strong>{outcome.winningOption.label}</strong>
              <span>{outcome.winningOption.title}</span>
              {outcome.winningOption.summary ? <p>{outcome.winningOption.summary}</p> : null}
            </div>
          ) : null}
          {rankings.length > 0 ? (
            <div className="council-vote-scoreboard">
              <div className="council-section-head">
                <strong>Voting Breakdown</strong>
                <span>Average rank and first-choice power</span>
              </div>
              <ul className="council-vote-score-list">
                {rankings.map((row) => {
                  const firstChoicePct = maxFirstChoiceVotes > 0
                    ? Math.round(((row.firstChoiceVotes ?? 0) / maxFirstChoiceVotes) * 100)
                    : 0
                  return (
                    <li key={row.id} className={row.isWinner ? 'is-winner' : ''}>
                      <div className="council-vote-score-head">
                        <strong>{row.label}</strong>
                        <span>{row.title}</span>
                      </div>
                      {row.summary ? <p>{row.summary}</p> : null}
                      <div className="council-vote-score-stats">
                        <span>{row.averageRank !== null ? `Avg rank ${row.averageRank.toFixed(2)}` : 'Avg rank --'}</span>
                        <span>{row.rankingCount !== null ? `${row.rankingCount} ballots` : 'Ballots --'}</span>
                        <span>{row.firstChoiceVotes !== null ? `${row.firstChoiceVotes} first-choice` : 'First-choice --'}</span>
                      </div>
                      <div className="council-vote-score-bar">
                        <div
                          className="council-vote-score-fill"
                          style={{ width: `${firstChoicePct}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
          {strategyPacket ? (
            <div className="council-strategy-board">
              <div className="council-section-head">
                <strong>Decision Ledger</strong>
                <span>{strategyPacket.decisionLedger.headline}</span>
              </div>
              <div className="council-highlight-box tone-neutral">
                <strong>Recommendation</strong>
                <span>{strategyPacket.decisionLedger.recommendation}</span>
              </div>
              <div className="council-highlight-box tone-accent">
                <strong>Why Now</strong>
                <span>{strategyPacket.decisionLedger.whyNow}</span>
              </div>
              <div className="council-strategy-meta">
                <span>Owner: {strategyPacket.decisionLedger.owner}</span>
                <span>Horizon: {strategyPacket.decisionLedger.horizon}</span>
                <span>Risk: {strategyPacket.missionBrief.riskPosture}</span>
              </div>
              {strategyPacket.optionScorecard.length > 0 ? (
                <div className="council-battlefield-map">
                  <div className="council-section-head">
                    <strong>Option Battlefield</strong>
                    <span>Impact, feasibility, risk, and confidence in one view</span>
                  </div>
                  <ul className="council-battlefield-list">
                    {strategyPacket.optionScorecard.map((option) => (
                      <li key={option.optionId}>
                        <div className="council-battlefield-header">
                          <strong>{option.label}</strong>
                          <span>{option.title}</span>
                        </div>
                        <p>{option.summary}</p>
                        <div className="council-battlefield-metrics">
                          <div className="council-score-meter tone-good">
                            <div className="council-score-meter-head">
                              <span>Impact</span>
                              <strong>{option.impact}/10</strong>
                            </div>
                            <div className="council-score-meter-track">
                              <div className="council-score-meter-fill" style={{ width: scoreWidth(option.impact) }} />
                            </div>
                          </div>
                          <div className="council-score-meter tone-accent">
                            <div className="council-score-meter-head">
                              <span>Feasibility</span>
                              <strong>{option.feasibility}/10</strong>
                            </div>
                            <div className="council-score-meter-track">
                              <div className="council-score-meter-fill" style={{ width: scoreWidth(option.feasibility) }} />
                            </div>
                          </div>
                          <div className="council-score-meter tone-warn">
                            <div className="council-score-meter-head">
                              <span>Risk</span>
                              <strong>{option.risk}/10</strong>
                            </div>
                            <div className="council-score-meter-track">
                              <div className="council-score-meter-fill" style={{ width: scoreWidth(option.risk) }} />
                            </div>
                          </div>
                          <div className="council-score-meter tone-neutral">
                            <div className="council-score-meter-head">
                              <span>Confidence</span>
                              <strong>{option.confidence}/10</strong>
                            </div>
                            <div className="council-score-meter-track">
                              <div className="council-score-meter-fill" style={{ width: scoreWidth(option.confidence) }} />
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {strategyPacket.dissentBoard.length > 0 ? (
                <div className="council-dissent-board">
                  <div className="council-section-head">
                    <strong>Dissent Board</strong>
                    <span>Keep disagreement visible instead of flattening it into consensus</span>
                  </div>
                  <ul className="council-dissent-list">
                    {strategyPacket.dissentBoard.map((entry) => (
                      <li key={`${entry.memberId}-${entry.displayName}`}>
                        <div className="council-dissent-head">
                          <strong>{entry.displayName}</strong>
                          <span>{entry.personaName || 'Council member'}</span>
                        </div>
                        <div className="council-confidence-pill">Confidence {entry.confidence}/10</div>
                        <p>{entry.objection}</p>
                        <small>{entry.whatChangesMind}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="council-redteam-card">
                <div className="council-section-head">
                  <strong>Red-Team Report</strong>
                  <span>{strategyPacket.redTeamReport.failureMode}</span>
                </div>
                <ul className="council-inline-list">
                  {strategyPacket.redTeamReport.triggerSignals.map((signal) => (
                    <li key={signal}>{signal}</li>
                  ))}
                </ul>
                <ul className="council-inline-list is-mitigations">
                  {strategyPacket.redTeamReport.mitigations.map((mitigation) => (
                    <li key={mitigation}>{mitigation}</li>
                  ))}
                </ul>
              </div>
              {strategyPacket.actionPlan.length > 0 ? (
                <div className="council-action-plan">
                  <div className="council-section-head">
                    <strong>7-Day Action Plan</strong>
                    <span>Convert the recommendation into execution immediately</span>
                  </div>
                  <ol className="council-action-list">
                    {strategyPacket.actionPlan.map((entry) => (
                      <li key={`${entry.timeframe}-${entry.title}`}>
                        <strong>{entry.title}</strong>
                        <span>{entry.timeframe} - {entry.owner}</span>
                        <p>{entry.successMetric}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {strategyPacket.judgeNarrative.length > 0 ? (
                <div className="council-judge-narrative">
                  <div className="council-section-head">
                    <strong>Judge Narrative</strong>
                    <span>The three lines to say while the board is on screen</span>
                  </div>
                  <ul className="council-inline-list">
                    {strategyPacket.judgeNarrative.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          {outcome.references.length > 0 ? (
            <ul className="council-reference-list">
              {outcome.references.map((reference) => (
                <li key={reference.url}>
                  <a href={reference.url} target="_blank" rel="noreferrer">
                    {reference.title}
                  </a>
                  {reference.snippet ? <span>{reference.snippet}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {runHistory.length > 0 ? (
            <div className="council-run-history">
              <div className="council-section-head">
                <strong>Decision Archive</strong>
                <span>Recent strategy runs</span>
              </div>
              <ul className="council-run-history-list">
                {runHistory.map((entry) => (
                  <li key={entry.runId}>
                    <strong>{entry.headline}</strong>
                    <span>{entry.winningOptionTitle}</span>
                    <div className="council-history-meta">
                      <small>{formatCompletedAt(entry.completedAt)}</small>
                      {entry.missionBrief?.objective ? <small>{entry.missionBrief.objective}</small> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : votingInProgress ? (
        <div className="council-live-vote-stack">
          <div className="council-section-head">
            <strong>{activeStage === 'options' ? 'Option Drafting' : 'Vote In Progress'}</strong>
            <span>
              {activeStage === 'options'
                ? 'The chairman is shaping final answer choices.'
                : 'Ballots are being cast and validated.'}
            </span>
          </div>
          <div className="council-live-vote-grid">
            <div className="council-live-vote-card">
              <strong>Option A</strong>
              <span>Awaiting finalized title</span>
            </div>
            <div className="council-live-vote-card">
              <strong>Option B</strong>
              <span>Awaiting finalized title</span>
            </div>
            <div className="council-live-vote-card">
              <strong>Option C</strong>
              <span>Awaiting finalized title</span>
            </div>
          </div>
          <ul className="council-live-voter-list">
            {members.length === 0 ? (
              <li className="tone-neutral">
                <strong>No active voters yet.</strong>
                <span>Member vote signals will appear as soon as the stage advances.</span>
              </li>
            ) : (
              members.map((member) => (
                <li key={member.id} className={`tone-${member.status === 'done' ? 'good' : member.status === 'voting' ? 'accent' : 'neutral'}`}>
                  <strong>{member.displayName}</strong>
                  <span>
                    {member.status === 'done'
                      ? 'Ballot submitted'
                      : member.status === 'voting'
                        ? 'Submitting ballot'
                        : 'Waiting for ballot'}
                  </span>
                </li>
              ))
            )}
          </ul>
          {liveVotingMembers.length > 0 ? (
            <div className="council-live-vote-summary">
              {liveVotingMembers.filter((member) => member.status === 'done').length} of {members.length} members have locked votes.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="council-empty-state">{emptyText}</div>
      )}
    </section>
  )
}
