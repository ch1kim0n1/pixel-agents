/**
 * Toast factory functions — plain TypeScript (no JSX),
 * kept separate so CouncilStageToast.tsx can be a component-only file.
 */

export type ToastKind =
  | 'session_started'
  | 'first_opinions'
  | 'review'
  | 'debate'
  | 'options'
  | 'vote'
  | 'final_synthesis'
  | 'awaiting_input'
  | 'results_available'
  | 'council_disrupted'
  | 'agent_error'
  | 'member_done'
  | 'custom'

export interface CouncilToastData {
  id: string
  kind: ToastKind
  title: string
  subtitle?: string
  /** Override the default icon for this kind */
  icon?: string
  /** Auto-dismiss duration in ms. 0 = sticky (never auto-dismiss). */
  duration?: number
}

export interface ToastVisualSpec {
  icon: string
  accent: string
  glowColor: string
  labelColor: string
  animate: 'none' | 'pulse' | 'scanline-flash'
  size: 'default' | 'hero'
}

export const TOAST_SPECS: Record<ToastKind, ToastVisualSpec> = {
  session_started: {
    icon: 'pixelarticons:briefcase',
    accent: '#3a9a7a',
    glowColor: 'rgba(58,154,122,0.25)',
    labelColor: '#3a9a7a',
    animate: 'none',
    size: 'default',
  },
  first_opinions: {
    icon: 'pixelarticons:message',
    accent: '#8abfff',
    glowColor: 'rgba(138,191,255,0.20)',
    labelColor: '#8abfff',
    animate: 'none',
    size: 'default',
  },
  review: {
    icon: 'pixelarticons:eye',
    accent: '#8abfff',
    glowColor: 'rgba(138,191,255,0.18)',
    labelColor: '#8abfff',
    animate: 'none',
    size: 'default',
  },
  debate: {
    icon: 'pixelarticons:command',
    accent: '#d9a950',
    glowColor: 'rgba(217,169,80,0.30)',
    labelColor: '#d9a950',
    animate: 'pulse',
    size: 'hero',
  },
  options: {
    icon: 'pixelarticons:bulletlist',
    accent: '#8abfff',
    glowColor: 'rgba(138,191,255,0.18)',
    labelColor: '#8abfff',
    animate: 'none',
    size: 'default',
  },
  vote: {
    icon: 'pixelarticons:bullseye',
    accent: '#d9a950',
    glowColor: 'rgba(217,169,80,0.32)',
    labelColor: '#d9a950',
    animate: 'pulse',
    size: 'hero',
  },
  final_synthesis: {
    icon: 'pixelarticons:layers',
    accent: '#3a9a7a',
    glowColor: 'rgba(58,154,122,0.28)',
    labelColor: '#3a9a7a',
    animate: 'scanline-flash',
    size: 'hero',
  },
  awaiting_input: {
    icon: 'pixelarticons:alert',
    accent: '#d9a950',
    glowColor: 'rgba(217,169,80,0.28)',
    labelColor: '#d9a950',
    animate: 'pulse',
    size: 'default',
  },
  results_available: {
    icon: 'pixelarticons:check-double',
    accent: '#34d399',
    glowColor: 'rgba(52,211,153,0.34)',
    labelColor: '#34d399',
    animate: 'scanline-flash',
    size: 'hero',
  },
  council_disrupted: {
    icon: 'pixelarticons:close-box',
    accent: '#c44040',
    glowColor: 'rgba(196,64,64,0.30)',
    labelColor: '#c44040',
    animate: 'none',
    size: 'default',
  },
  agent_error: {
    icon: 'pixelarticons:warning-box',
    accent: '#c44040',
    glowColor: 'rgba(196,64,64,0.22)',
    labelColor: '#c44040',
    animate: 'none',
    size: 'default',
  },
  member_done: {
    icon: 'pixelarticons:check',
    accent: '#3a9a7a',
    glowColor: 'rgba(58,154,122,0.18)',
    labelColor: '#3a9a7a',
    animate: 'none',
    size: 'default',
  },
  custom: {
    icon: 'pixelarticons:info-box',
    accent: '#8a9ab8',
    glowColor: 'rgba(138,154,184,0.18)',
    labelColor: '#8a9ab8',
    animate: 'none',
    size: 'default',
  },
}

// ─── Factory helpers ──────────────────────────────────────────────────────

let _seq = 0
function nextId(): string {
  return `cst-${Date.now()}-${++_seq}`
}

export function makeSessionStartedToast(): CouncilToastData {
  return {
    id: nextId(),
    kind: 'session_started',
    title: 'Council Convened',
    subtitle: 'Mission briefing received. All agents standing by.',
  }
}

export function makeStageToast(stage: string): CouncilToastData | null {
  const map: Record<string, Pick<CouncilToastData, 'kind' | 'title' | 'subtitle'>> = {
    first_opinions:  { kind: 'first_opinions',  title: 'First Opinions',    subtitle: 'Each council member is forming their independent view.' },
    review:          { kind: 'review',           title: 'Under Review',      subtitle: 'Cross-examination begins — members review each other.' },
    debate:          { kind: 'debate',           title: 'Debate Time',       subtitle: 'The floor is open. Arguments incoming.' },
    options:         { kind: 'options',          title: 'Options Forming',   subtitle: 'Council is drafting candidate paths forward.' },
    vote:            { kind: 'vote',             title: 'Vote Is In Session', subtitle: 'Each member casts their ranked vote now.' },
    final_synthesis: { kind: 'final_synthesis',  title: 'Final Synthesis',   subtitle: 'Chairman compiling the authoritative verdict.' },
  }
  const spec = map[stage]
  if (!spec) return null
  return { id: nextId(), ...spec }
}

export function makeAwaitingInputToast(question: string): CouncilToastData {
  return { id: nextId(), kind: 'awaiting_input', title: 'New Question Came Up', subtitle: question, duration: 0 }
}

export function makeResultsToast(): CouncilToastData {
  return { id: nextId(), kind: 'results_available', title: 'Results Are Available', subtitle: 'The council has reached a verdict. Review the outcome panel.' }
}

export function makeDisruptedToast(reason?: string): CouncilToastData {
  return { id: nextId(), kind: 'council_disrupted', title: 'Council Disrupted', subtitle: reason ?? 'The session was interrupted.' }
}

export function makeAgentErrorToast(agentId: string, message: string): CouncilToastData {
  return { id: nextId(), kind: 'agent_error', title: 'Agent Error', subtitle: `${agentId}: ${message}`, duration: 6000 }
}
