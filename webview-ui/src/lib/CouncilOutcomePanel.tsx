import type { CouncilOutcomeSummary } from './council-ux.js'

export interface CouncilOutcomePanelProps {
  outcome: CouncilOutcomeSummary | null
  emptyText: string
}

export function CouncilOutcomePanel({
  outcome,
  emptyText,
}: CouncilOutcomePanelProps) {
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
          {outcome.optionRankings.length > 0 ? (
            <ul className="council-outcome-list">
              {outcome.optionRankings.map((ranking) => (
                <li key={`${ranking.label}-${ranking.optionId ?? ''}`}>
                  <strong>{ranking.label}</strong>
                  {ranking.title ? ` - ${ranking.title}` : ''}
                  {typeof ranking.averageRank === 'number' ? ` (avg rank ${ranking.averageRank})` : ''}
                </li>
              ))}
            </ul>
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
        </div>
      ) : (
        <div className="council-empty-state">{emptyText}</div>
      )}
    </section>
  )
}
