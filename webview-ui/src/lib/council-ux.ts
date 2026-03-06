import type {
  CouncilAnswerChoice,
  CouncilMemberRole,
  CouncilOptionRanking,
  CouncilReference,
  CouncilStage,
} from './council-events.js'

export const COUNCIL_STAGE_LABELS: Record<CouncilStage, string> = {
  first_opinions: 'First Opinions',
  review: 'Review',
  debate: 'Debate',
  options: 'Options',
  vote: 'Vote',
  final_synthesis: 'Final Synthesis',
}

export type CouncilUxTransportState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'mock'

export type CouncilUxSessionState =
  | 'idle'
  | 'running'
  | 'awaiting_input'
  | 'completed'
  | 'failed'

export type CouncilUxTone = 'neutral' | 'accent' | 'good' | 'warn' | 'error'

export type CouncilUxNextAction =
  | 'connect'
  | 'start_run'
  | 'observe'
  | 'clarify'
  | 'review'
  | 'rerun'

export type CouncilUxMilestone = 'none' | 'flawless' | 'clarified' | 'interrupted'

export interface CouncilStageRailItem {
  stage: CouncilStage
  label: string
  state: 'locked' | 'active' | 'completed'
}

export interface CouncilOutcomeSummary {
  finalResponse: string
  winningOption: CouncilAnswerChoice | null
  options: CouncilAnswerChoice[]
  references: CouncilReference[]
  optionRankings: CouncilOptionRanking[]
}

export interface CouncilRosterEntry {
  id: string
  displayName: string
  role: CouncilMemberRole
  status: string
  statusLabel: string
  tone: CouncilUxTone
  detail?: string
  personaName?: string
  personaSummary?: string
}

export interface CouncilMissionLogEntry {
  id: string
  label: string
  tone: CouncilUxTone
}

export interface CouncilActionBannerCopy {
  tone: CouncilUxTone
  title: string
  description: string
  actionLabel?: string
}

export function deriveCouncilNextAction(
  transportState: CouncilUxTransportState,
  sessionState: CouncilUxSessionState,
): CouncilUxNextAction {
  if (transportState === 'error' || transportState === 'disconnected') return 'connect'
  if (sessionState === 'idle') return 'start_run'
  if (sessionState === 'awaiting_input') return 'clarify'
  if (sessionState === 'completed') return 'review'
  if (sessionState === 'failed') return 'rerun'
  return 'observe'
}

export function deriveCouncilMilestone(options: {
  sessionState: CouncilUxSessionState
  hadWaiting: boolean
  hadError: boolean
  wasInterrupted: boolean
}): CouncilUxMilestone {
  if (options.wasInterrupted || options.sessionState === 'failed') return 'interrupted'
  if (options.sessionState !== 'completed') return 'none'
  if (options.hadWaiting) return 'clarified'
  if (!options.hadError) return 'flawless'
  return 'none'
}

export function buildCouncilStageRail(
  stages: readonly CouncilStage[],
  activeStage: CouncilStage | null,
  completedStages: ReadonlySet<CouncilStage>,
): CouncilStageRailItem[] {
  return stages.map((stage) => ({
    stage,
    label: COUNCIL_STAGE_LABELS[stage],
    state: completedStages.has(stage)
      ? 'completed'
      : activeStage === stage
        ? 'active'
        : 'locked',
  }))
}

export function councilStatusLabel(status: string): string {
  switch (status) {
    case 'thinking':
      return 'Thinking'
    case 'reviewing':
      return 'Reviewing'
    case 'debating':
      return 'Debating'
    case 'voting':
      return 'Voting'
    case 'synthesizing':
      return 'Synthesizing'
    case 'waiting':
      return 'Waiting'
    case 'done':
      return 'Done'
    case 'error':
      return 'Error'
    default:
      return 'Idle'
  }
}

export function councilStatusTone(status: string): CouncilUxTone {
  switch (status) {
    case 'thinking':
    case 'reviewing':
    case 'debating':
    case 'voting':
    case 'synthesizing':
      return 'accent'
    case 'waiting':
      return 'warn'
    case 'done':
      return 'good'
    case 'error':
      return 'error'
    default:
      return 'neutral'
  }
}

export function buildMissionLogEntries(lines: string[]): CouncilMissionLogEntry[] {
  return lines.map((line, index) => ({
    id: `${index}-${line}`,
    label: line,
    tone: inferMissionLogTone(line),
  }))
}

function inferMissionLogTone(line: string): CouncilUxTone {
  const lowered = line.toLowerCase()
  if (
    lowered.includes('error')
    || lowered.includes('failed')
    || lowered.includes('cancel')
  ) return 'error'
  if (
    lowered.includes('clarification')
    || lowered.includes('needs')
    || lowered.includes('waiting')
  ) return 'warn'
  if (
    lowered.includes('completed')
    || lowered.includes('winner')
    || lowered.includes('connected')
  ) return 'good'
  if (lowered.includes('started') || lowered.includes('thinking')) return 'accent'
  return 'neutral'
}

export function getCouncilActionBannerCopy(
  nextAction: CouncilUxNextAction,
  options?: {
    transportMessage?: string
    latestQuestion?: string | null
    lastSummary?: string | null
  },
): CouncilActionBannerCopy {
  switch (nextAction) {
    case 'connect':
      return {
        tone: 'warn',
        title: 'Connect The Council',
        description:
          options?.transportMessage?.trim()
          || 'Open the transport and confirm the room is ready before launching a mission.',
        actionLabel: 'Connect',
      }
    case 'start_run':
      return {
        tone: 'accent',
        title: 'Launch The First Deliberation',
        description:
          'Frame the mission clearly, then send it to the council with one primary action.',
        actionLabel: 'Start Run',
      }
    case 'clarify':
      return {
        tone: 'warn',
        title: 'Council Needs Clarification',
        description:
          options?.latestQuestion?.trim()
          || 'Answer the open question and rerun the council with tighter constraints.',
        actionLabel: 'Clarify And Rerun',
      }
    case 'review':
      return {
        tone: 'good',
        title: 'Decision Ready',
        description:
          options?.lastSummary?.trim()
          || 'Review the final synthesis, winning option, and references before the next run.',
      }
    case 'rerun':
      return {
        tone: 'error',
        title: 'Mission Interrupted',
        description:
          'Refine the brief or reconnect, then relaunch the council with a corrected prompt.',
        actionLabel: 'Rerun',
      }
    default:
      return {
        tone: 'accent',
        title: 'Council In Session',
        description: 'Track live progress while the members deliberate across each stage.',
      }
  }
}
