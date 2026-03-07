export const COUNCIL_STAGE_ORDER = [
  'first_opinions',
  'review',
  'debate',
  'options',
  'vote',
  'final_synthesis',
] as const

export type CouncilStage = (typeof COUNCIL_STAGE_ORDER)[number]

export type CouncilMemberRole = 'member' | 'chairman'

export type CouncilActivity =
  | 'thinking'
  | 'reviewing'
  | 'debating'
  | 'voting'
  | 'synthesizing'

export interface CouncilAnswerChoice {
  id: string
  label: string
  title: string
  summary?: string
  rationale?: string
}

export interface CouncilReference {
  title: string
  url: string
  snippet?: string
}

export interface CouncilOptionRanking {
  optionId?: string
  label: string
  title?: string
  averageRank?: number
  rankingsCount?: number
  firstChoiceVotes?: number
}

export interface CouncilMissionBrief {
  objective: string
  successMetrics: string[]
  constraints: string[]
  decisionWindow: string
  riskPosture: string
  missingInfo: string[]
}

export interface CouncilDecisionLedger {
  headline: string
  recommendation: string
  whyNow: string
  owner: string
  horizon: string
  killCriteria: string[]
}

export interface CouncilOptionScorecardEntry {
  optionId: string
  label: string
  title: string
  summary: string
  impact: number
  feasibility: number
  risk: number
  confidence: number
  bestFor: string
  watchouts: string[]
}

export interface CouncilDissentEntry {
  memberId: string
  displayName: string
  personaName?: string
  stance: string
  objection: string
  whatChangesMind: string
  confidence: number
}

export interface CouncilRedTeamReport {
  failureMode: string
  triggerSignals: string[]
  mitigations: string[]
}

export interface CouncilActionPlanEntry {
  title: string
  owner: string
  timeframe: string
  successMetric: string
  dependencies: string[]
}

export interface CouncilStrategyPacket {
  missionBrief: CouncilMissionBrief
  decisionLedger: CouncilDecisionLedger
  optionScorecard: CouncilOptionScorecardEntry[]
  dissentBoard: CouncilDissentEntry[]
  redTeamReport: CouncilRedTeamReport
  actionPlan: CouncilActionPlanEntry[]
  judgeNarrative: string[]
}

export interface CouncilMemberDescriptor {
  id: string
  displayName: string
  role?: CouncilMemberRole
  model?: string
  personaId?: string
  personaName?: string
  personaSummary?: string
}

interface BaseCouncilEvent {
  type: string
  sessionId?: string
  runId?: string
  sequence?: number
  ts?: string
}

export interface CouncilSessionStartedEvent extends BaseCouncilEvent {
  type: 'session.started'
  prompt?: string
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
  members: CouncilMemberDescriptor[]
}

export interface CouncilStageStartedEvent extends BaseCouncilEvent {
  type: 'stage.started'
  stage: CouncilStage
  summary?: string
  artifact?: Record<string, unknown>
}

export interface CouncilStageCompletedEvent extends BaseCouncilEvent {
  type: 'stage.completed'
  stage: CouncilStage
  summary?: string
  artifact?: Record<string, unknown>
}

export interface CouncilMemberStartedEvent extends BaseCouncilEvent {
  type: 'member.started'
  memberId: string
  stage: CouncilStage
  activity?: CouncilActivity
  detail?: string
}

export interface CouncilMemberCompletedEvent extends BaseCouncilEvent {
  type: 'member.completed'
  memberId: string
  stage: CouncilStage
  detail?: string
}

export interface CouncilMemberWaitingEvent extends BaseCouncilEvent {
  type: 'member.waiting'
  memberId: string
  stage: CouncilStage
  reason?: string
}

export interface CouncilMemberErrorEvent extends BaseCouncilEvent {
  type: 'member.error'
  memberId: string
  stage: CouncilStage
  message: string
}

export type CouncilChatRole = 'user' | 'assistant' | 'system'

export interface CouncilMemberChatMessageEvent extends BaseCouncilEvent {
  type: 'member.chat.message'
  memberId: string
  role: CouncilChatRole
  content: string
  messageId?: string
}

export interface CouncilMemberChatErrorEvent extends BaseCouncilEvent {
  type: 'member.chat.error'
  memberId: string
  message: string
}

export interface CouncilSessionCompletedEvent extends BaseCouncilEvent {
  type: 'session.completed'
  summary?: string
  finalResponse?: string
  winningOption?: CouncilAnswerChoice
  options?: CouncilAnswerChoice[]
  references?: CouncilReference[]
  optionRankings?: CouncilOptionRanking[]
  strategyPacket?: CouncilStrategyPacket
}

export interface CouncilSessionFailedEvent extends BaseCouncilEvent {
  type: 'session.failed'
  message: string
}

export interface CouncilHeartbeatEvent extends BaseCouncilEvent {
  type: 'heartbeat'
}

export type CouncilEvent =
  | CouncilSessionStartedEvent
  | CouncilStageStartedEvent
  | CouncilStageCompletedEvent
  | CouncilMemberStartedEvent
  | CouncilMemberCompletedEvent
  | CouncilMemberWaitingEvent
  | CouncilMemberErrorEvent
  | CouncilMemberChatMessageEvent
  | CouncilMemberChatErrorEvent
  | CouncilSessionCompletedEvent
  | CouncilSessionFailedEvent
  | CouncilHeartbeatEvent

export interface CouncilEventConnection {
  connect: () => void
  disconnect: () => void
  subscribe: (listener: (event: CouncilEvent) => void) => () => void
  send: (message: unknown) => void
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
}

function parseStrategyPacket(value: unknown): CouncilStrategyPacket | null {
  const packet = asRecord(value)
  if (!packet) return null

  const missionBriefRaw = asRecord(packet.missionBrief)
  const decisionLedgerRaw = asRecord(packet.decisionLedger)
  const redTeamRaw = asRecord(packet.redTeamReport)
  if (!missionBriefRaw || !decisionLedgerRaw || !redTeamRaw) return null

  const optionScorecard = Array.isArray(packet.optionScorecard)
    ? packet.optionScorecard
      .map((entry): CouncilOptionScorecardEntry | null => {
        const item = asRecord(entry)
        if (!item) return null
        if (
          typeof item.optionId !== 'string'
          || typeof item.label !== 'string'
          || typeof item.title !== 'string'
        ) return null
        return {
          optionId: item.optionId,
          label: item.label,
          title: item.title,
          summary: typeof item.summary === 'string' ? item.summary : '',
          impact: typeof item.impact === 'number' ? item.impact : 0,
          feasibility: typeof item.feasibility === 'number' ? item.feasibility : 0,
          risk: typeof item.risk === 'number' ? item.risk : 0,
          confidence: typeof item.confidence === 'number' ? item.confidence : 0,
          bestFor: typeof item.bestFor === 'string' ? item.bestFor : '',
          watchouts: asStringArray(item.watchouts),
        }
      })
      .filter((entry): entry is CouncilOptionScorecardEntry => entry !== null)
    : []

  const dissentBoard = Array.isArray(packet.dissentBoard)
    ? packet.dissentBoard
      .map((entry): CouncilDissentEntry | null => {
        const item = asRecord(entry)
        if (!item) return null
        if (typeof item.memberId !== 'string' || typeof item.displayName !== 'string') return null
        return {
          memberId: item.memberId,
          displayName: item.displayName,
          personaName: typeof item.personaName === 'string' ? item.personaName : undefined,
          stance: typeof item.stance === 'string' ? item.stance : '',
          objection: typeof item.objection === 'string' ? item.objection : '',
          whatChangesMind: typeof item.whatChangesMind === 'string' ? item.whatChangesMind : '',
          confidence: typeof item.confidence === 'number' ? item.confidence : 0,
        }
      })
      .filter((entry): entry is CouncilDissentEntry => entry !== null)
    : []

  const actionPlan = Array.isArray(packet.actionPlan)
    ? packet.actionPlan
      .map((entry): CouncilActionPlanEntry | null => {
        const item = asRecord(entry)
        if (!item || typeof item.title !== 'string') return null
        return {
          title: item.title,
          owner: typeof item.owner === 'string' ? item.owner : '',
          timeframe: typeof item.timeframe === 'string' ? item.timeframe : '',
          successMetric: typeof item.successMetric === 'string' ? item.successMetric : '',
          dependencies: asStringArray(item.dependencies),
        }
      })
      .filter((entry): entry is CouncilActionPlanEntry => entry !== null)
    : []

  return {
    missionBrief: {
      objective: typeof missionBriefRaw.objective === 'string' ? missionBriefRaw.objective : '',
      successMetrics: asStringArray(missionBriefRaw.successMetrics),
      constraints: asStringArray(missionBriefRaw.constraints),
      decisionWindow: typeof missionBriefRaw.decisionWindow === 'string' ? missionBriefRaw.decisionWindow : '',
      riskPosture: typeof missionBriefRaw.riskPosture === 'string' ? missionBriefRaw.riskPosture : '',
      missingInfo: asStringArray(missionBriefRaw.missingInfo),
    },
    decisionLedger: {
      headline: typeof decisionLedgerRaw.headline === 'string' ? decisionLedgerRaw.headline : '',
      recommendation: typeof decisionLedgerRaw.recommendation === 'string' ? decisionLedgerRaw.recommendation : '',
      whyNow: typeof decisionLedgerRaw.whyNow === 'string' ? decisionLedgerRaw.whyNow : '',
      owner: typeof decisionLedgerRaw.owner === 'string' ? decisionLedgerRaw.owner : '',
      horizon: typeof decisionLedgerRaw.horizon === 'string' ? decisionLedgerRaw.horizon : '',
      killCriteria: asStringArray(decisionLedgerRaw.killCriteria),
    },
    optionScorecard,
    dissentBoard,
    redTeamReport: {
      failureMode: typeof redTeamRaw.failureMode === 'string' ? redTeamRaw.failureMode : '',
      triggerSignals: asStringArray(redTeamRaw.triggerSignals),
      mitigations: asStringArray(redTeamRaw.mitigations),
    },
    actionPlan,
    judgeNarrative: asStringArray(packet.judgeNarrative),
  }
}

export function isCouncilStage(value: unknown): value is CouncilStage {
  return typeof value === 'string' && COUNCIL_STAGE_ORDER.includes(value as CouncilStage)
}

function normalizeLegacyStage(stageEvent: string): CouncilStage | null {
  if (stageEvent.startsWith('stage1_')) return 'first_opinions'
  if (stageEvent.startsWith('stage2_')) return 'review'
  if (stageEvent.startsWith('stage3_')) return 'final_synthesis'
  return null
}

function normalizeLegacyType(
  legacyType: string,
): 'stage.started' | 'stage.completed' | 'session.completed' | 'session.failed' | null {
  switch (legacyType) {
    case 'stage1_start':
    case 'stage2_start':
    case 'stage3_start':
      return 'stage.started'
    case 'stage1_complete':
    case 'stage2_complete':
    case 'stage3_complete':
      return 'stage.completed'
    case 'complete':
      return 'session.completed'
    case 'error':
      return 'session.failed'
    default:
      return null
  }
}

export function parseCouncilEvent(raw: unknown): CouncilEvent | null {
  const obj = asRecord(raw)
  if (!obj) return null

  const typeRaw = obj.type
  if (typeof typeRaw !== 'string') return null

  if (typeRaw === 'session.started') {
    const membersRaw = Array.isArray(obj.members) ? obj.members : []
    const members: CouncilMemberDescriptor[] = membersRaw
      .map((member): CouncilMemberDescriptor | null => {
        const m = asRecord(member)
        if (!m) return null
        if (typeof m.id !== 'string' || typeof m.displayName !== 'string') return null
        return {
          id: m.id,
          displayName: m.displayName,
          role: m.role === 'chairman' ? 'chairman' : 'member',
          model: typeof m.model === 'string' ? m.model : undefined,
          personaId: typeof m.personaId === 'string' ? m.personaId : undefined,
          personaName: typeof m.personaName === 'string' ? m.personaName : undefined,
          personaSummary: typeof m.personaSummary === 'string' ? m.personaSummary : undefined,
        }
      })
      .filter((member): member is CouncilMemberDescriptor => member !== null)
    return {
      type: 'session.started',
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      runId: typeof obj.runId === 'string' ? obj.runId : undefined,
      sequence: typeof obj.sequence === 'number' ? obj.sequence : undefined,
      ts: typeof obj.ts === 'string' ? obj.ts : undefined,
      prompt: typeof obj.prompt === 'string' ? obj.prompt : undefined,
      reasoningEffort:
        obj.reasoningEffort === 'none'
        || obj.reasoningEffort === 'low'
        || obj.reasoningEffort === 'medium'
        || obj.reasoningEffort === 'high'
          ? obj.reasoningEffort
          : undefined,
      members,
    }
  }

  if (typeRaw === 'stage.started' || typeRaw === 'stage.completed') {
    if (!isCouncilStage(obj.stage)) return null
    return {
      type: typeRaw,
      stage: obj.stage,
      summary: typeof obj.summary === 'string' ? obj.summary : undefined,
      artifact: asRecord(obj.artifact) ?? undefined,
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      runId: typeof obj.runId === 'string' ? obj.runId : undefined,
      sequence: typeof obj.sequence === 'number' ? obj.sequence : undefined,
      ts: typeof obj.ts === 'string' ? obj.ts : undefined,
    }
  }

  if (typeRaw === 'member.started') {
    if (typeof obj.memberId !== 'string' || !isCouncilStage(obj.stage)) return null
    return {
      type: 'member.started',
      memberId: obj.memberId,
      stage: obj.stage,
      activity:
        obj.activity === 'reviewing'
        || obj.activity === 'debating'
        || obj.activity === 'voting'
        || obj.activity === 'synthesizing'
          ? obj.activity
          : 'thinking',
      detail: typeof obj.detail === 'string' ? obj.detail : undefined,
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      runId: typeof obj.runId === 'string' ? obj.runId : undefined,
      sequence: typeof obj.sequence === 'number' ? obj.sequence : undefined,
      ts: typeof obj.ts === 'string' ? obj.ts : undefined,
    }
  }

  if (typeRaw === 'member.completed') {
    if (typeof obj.memberId !== 'string' || !isCouncilStage(obj.stage)) return null
    return {
      type: 'member.completed',
      memberId: obj.memberId,
      stage: obj.stage,
      detail: typeof obj.detail === 'string' ? obj.detail : undefined,
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      runId: typeof obj.runId === 'string' ? obj.runId : undefined,
      sequence: typeof obj.sequence === 'number' ? obj.sequence : undefined,
      ts: typeof obj.ts === 'string' ? obj.ts : undefined,
    }
  }

  if (typeRaw === 'member.waiting') {
    if (typeof obj.memberId !== 'string' || !isCouncilStage(obj.stage)) return null
    return {
      type: 'member.waiting',
      memberId: obj.memberId,
      stage: obj.stage,
      reason: typeof obj.reason === 'string' ? obj.reason : undefined,
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      runId: typeof obj.runId === 'string' ? obj.runId : undefined,
      sequence: typeof obj.sequence === 'number' ? obj.sequence : undefined,
      ts: typeof obj.ts === 'string' ? obj.ts : undefined,
    }
  }

  if (typeRaw === 'member.error') {
    if (typeof obj.memberId !== 'string' || !isCouncilStage(obj.stage)) return null
    return {
      type: 'member.error',
      memberId: obj.memberId,
      stage: obj.stage,
      message: typeof obj.message === 'string' ? obj.message : 'Unknown member error.',
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      runId: typeof obj.runId === 'string' ? obj.runId : undefined,
      sequence: typeof obj.sequence === 'number' ? obj.sequence : undefined,
      ts: typeof obj.ts === 'string' ? obj.ts : undefined,
    }
  }

  if (typeRaw === 'member.chat.message') {
    if (typeof obj.memberId !== 'string' || typeof obj.content !== 'string') return null
    return {
      type: 'member.chat.message',
      memberId: obj.memberId,
      role:
        obj.role === 'assistant'
        || obj.role === 'system'
        || obj.role === 'user'
          ? obj.role
          : 'assistant',
      content: obj.content,
      messageId: typeof obj.messageId === 'string' ? obj.messageId : undefined,
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      runId: typeof obj.runId === 'string' ? obj.runId : undefined,
      sequence: typeof obj.sequence === 'number' ? obj.sequence : undefined,
      ts: typeof obj.ts === 'string' ? obj.ts : undefined,
    }
  }

  if (typeRaw === 'member.chat.error') {
    if (typeof obj.memberId !== 'string') return null
    return {
      type: 'member.chat.error',
      memberId: obj.memberId,
      message: typeof obj.message === 'string' ? obj.message : 'Member chat failed.',
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      runId: typeof obj.runId === 'string' ? obj.runId : undefined,
      sequence: typeof obj.sequence === 'number' ? obj.sequence : undefined,
      ts: typeof obj.ts === 'string' ? obj.ts : undefined,
    }
  }

  if (typeRaw === 'session.completed') {
    const parseChoice = (value: unknown): CouncilAnswerChoice | null => {
      const choice = asRecord(value)
      if (!choice) return null
      if (
        typeof choice.id !== 'string'
        || typeof choice.label !== 'string'
        || typeof choice.title !== 'string'
      ) return null
      return {
        id: choice.id,
        label: choice.label,
        title: choice.title,
        summary: typeof choice.summary === 'string' ? choice.summary : undefined,
        rationale: typeof choice.rationale === 'string' ? choice.rationale : undefined,
      }
    }

    const parseReference = (value: unknown): CouncilReference | null => {
      const reference = asRecord(value)
      if (!reference) return null
      if (typeof reference.title !== 'string' || typeof reference.url !== 'string') return null
      return {
        title: reference.title,
        url: reference.url,
        snippet: typeof reference.snippet === 'string' ? reference.snippet : undefined,
      }
    }

    const parseOptionRanking = (value: unknown): CouncilOptionRanking | null => {
      const ranking = asRecord(value)
      if (!ranking || typeof ranking.label !== 'string') return null
      return {
        optionId: typeof ranking.option_id === 'string' ? ranking.option_id : undefined,
        label: ranking.label,
        title: typeof ranking.title === 'string' ? ranking.title : undefined,
        averageRank: typeof ranking.average_rank === 'number' ? ranking.average_rank : undefined,
        rankingsCount:
          typeof ranking.rankings_count === 'number' ? ranking.rankings_count : undefined,
        firstChoiceVotes:
          typeof ranking.first_choice_votes === 'number' ? ranking.first_choice_votes : undefined,
      }
    }

    return {
      type: 'session.completed',
      summary: typeof obj.summary === 'string' ? obj.summary : undefined,
      finalResponse: typeof obj.finalResponse === 'string' ? obj.finalResponse : undefined,
      winningOption: parseChoice(obj.winningOption) ?? undefined,
      options: Array.isArray(obj.options)
        ? obj.options
          .map((entry) => parseChoice(entry))
          .filter((entry): entry is CouncilAnswerChoice => entry !== null)
        : undefined,
      references: Array.isArray(obj.references)
        ? obj.references
          .map((entry) => parseReference(entry))
          .filter((entry): entry is CouncilReference => entry !== null)
        : undefined,
      optionRankings: Array.isArray(obj.optionRankings)
        ? obj.optionRankings
          .map((entry) => parseOptionRanking(entry))
          .filter((entry): entry is CouncilOptionRanking => entry !== null)
        : undefined,
      strategyPacket: parseStrategyPacket(obj.strategyPacket) ?? undefined,
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      runId: typeof obj.runId === 'string' ? obj.runId : undefined,
      sequence: typeof obj.sequence === 'number' ? obj.sequence : undefined,
      ts: typeof obj.ts === 'string' ? obj.ts : undefined,
    }
  }

  if (typeRaw === 'session.failed') {
    return {
      type: 'session.failed',
      message: typeof obj.message === 'string' ? obj.message : 'Council session failed.',
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      runId: typeof obj.runId === 'string' ? obj.runId : undefined,
      sequence: typeof obj.sequence === 'number' ? obj.sequence : undefined,
      ts: typeof obj.ts === 'string' ? obj.ts : undefined,
    }
  }

  if (typeRaw === 'heartbeat') {
    return {
      type: 'heartbeat',
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      runId: typeof obj.runId === 'string' ? obj.runId : undefined,
      sequence: typeof obj.sequence === 'number' ? obj.sequence : undefined,
      ts: typeof obj.ts === 'string' ? obj.ts : undefined,
    }
  }

  return null
}

export function parseLegacyCouncilEvent(raw: unknown): CouncilEvent | null {
  const obj = asRecord(raw)
  if (!obj || typeof obj.event !== 'string') return null

  const normalizedType = normalizeLegacyType(obj.event)
  if (!normalizedType) return null

  if (normalizedType === 'session.completed') {
    return {
      type: 'session.completed',
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      runId: typeof obj.runId === 'string' ? obj.runId : undefined,
      sequence: typeof obj.sequence === 'number' ? obj.sequence : undefined,
      ts: typeof obj.ts === 'string' ? obj.ts : undefined,
    }
  }

  if (normalizedType === 'session.failed') {
    const errors = Array.isArray(obj.errors) ? obj.errors : []
    const firstError = asRecord(errors[0])
    return {
      type: 'session.failed',
      message:
        typeof firstError?.message === 'string'
          ? firstError.message
          : 'Council stream failed.',
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      runId: typeof obj.runId === 'string' ? obj.runId : undefined,
      sequence: typeof obj.sequence === 'number' ? obj.sequence : undefined,
      ts: typeof obj.ts === 'string' ? obj.ts : undefined,
    }
  }

  const stage = normalizeLegacyStage(obj.event)
  if (!stage) return null
  if (normalizedType === 'stage.started' || normalizedType === 'stage.completed') {
    return {
      type: normalizedType,
      stage,
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      runId: typeof obj.runId === 'string' ? obj.runId : undefined,
      sequence: typeof obj.sequence === 'number' ? obj.sequence : undefined,
      ts: typeof obj.ts === 'string' ? obj.ts : undefined,
    }
  }
  return null
}
