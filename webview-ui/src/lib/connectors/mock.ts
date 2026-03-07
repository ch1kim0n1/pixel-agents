import type { CouncilEvent, CouncilEventConnection, CouncilMemberDescriptor } from '../council-events.js'

export interface MockCouncilConnectionOptions {
  members?: CouncilMemberDescriptor[]
  stageDelayMs?: number
}

export function createMockCouncilConnection(
  options: MockCouncilConnectionOptions = {},
): CouncilEventConnection {
  const listeners = new Set<(event: CouncilEvent) => void>()
  const stageDelayMs = Math.max(500, options.stageDelayMs ?? 2000)
  const members = options.members ?? [
    { id: 'chairman', displayName: 'Lead Synth', role: 'chairman' as const },
    { id: 'member-a', displayName: 'Model A' },
    { id: 'member-b', displayName: 'Model B' },
    { id: 'member-c', displayName: 'Model C' },
    { id: 'member-d', displayName: 'Model D' },
    { id: 'member-e', displayName: 'Model E' },
    { id: 'member-f', displayName: 'Model F' },
  ]
  const memberIds = members.map((member) => member.id)
  const primaryMemberId = memberIds[0] ?? 'chairman'
  const memberNameById = new Map(members.map((member) => [member.id, member.displayName]))
  const privateChatTurns = new Map<string, number>()

  let timer: number | null = null
  let cursor = 0
  let running = false

  const stageOneStart: CouncilEvent[] = memberIds.map((memberId) => ({
    type: 'member.started',
    memberId,
    stage: 'first_opinions',
    activity: 'thinking',
  }))
  const stageOneDone: CouncilEvent[] = memberIds.map((memberId) => ({
    type: 'member.completed',
    memberId,
    stage: 'first_opinions',
  }))
  const stageTwoStart: CouncilEvent[] = memberIds.map((memberId) => ({
    type: 'member.started',
    memberId,
    stage: 'review',
    activity: 'reviewing',
  }))
  const stageTwoDone: CouncilEvent[] = memberIds.map((memberId) => ({
    type: 'member.completed',
    memberId,
    stage: 'review',
  }))
  const stageThreeStart: CouncilEvent[] = memberIds.map((memberId) => ({
    type: 'member.started',
    memberId,
    stage: 'debate',
    activity: 'debating',
  }))
  const stageThreeDone: CouncilEvent[] = memberIds.map((memberId) => ({
    type: 'member.completed',
    memberId,
    stage: 'debate',
  }))
  const stageVoteStart: CouncilEvent[] = memberIds.map((memberId) => ({
    type: 'member.started',
    memberId,
    stage: 'vote',
    activity: 'voting',
  }))
  const stageVoteDone: CouncilEvent[] = memberIds.map((memberId) => ({
    type: 'member.completed',
    memberId,
    stage: 'vote',
    detail: memberId === primaryMemberId ? 'Top vote: Option A' : 'Top vote: Option B',
  }))
  const strategyPacket = {
    missionBrief: {
      objective: 'Deliver a judge-ready strategy room demo.',
      successMetrics: ['One defensible recommendation', 'Visible tradeoffs and evidence'],
      constraints: ['Keep the live room stable', 'Do not bloat the demo scope'],
      decisionWindow: 'This weekend',
      riskPosture: 'Balanced',
      missingInfo: [],
    },
    decisionLedger: {
      headline: 'Focused demo path',
      recommendation: 'Polish the current council flow before adding more surface area.',
      whyNow: 'It creates the clearest story with the least execution risk.',
      owner: 'Demo lead',
      horizon: '7-day sprint',
      killCriteria: ['Abort if the demo still feels unreliable after the stabilization pass.'],
    },
    optionScorecard: [
      {
        optionId: 'option_a',
        label: 'Option A',
        title: 'Ship the focused demo path',
        summary: 'Stabilize the room and make the core strategy experience undeniable.',
        impact: 9,
        feasibility: 8,
        risk: 3,
        confidence: 9,
        bestFor: 'A high-confidence judge demo.',
        watchouts: ['Do not confuse polish with strategic depth.'],
      },
      {
        optionId: 'option_b',
        label: 'Option B',
        title: 'Add broader feature depth',
        summary: 'Expand scope quickly and accept higher demo volatility.',
        impact: 8,
        feasibility: 4,
        risk: 8,
        confidence: 5,
        bestFor: 'Teams chasing upside over reliability.',
        watchouts: ['Scope can outrun quality fast.'],
      },
    ],
    dissentBoard: [
      {
        memberId: 'member-b',
        displayName: 'Model B',
        personaName: 'Skeptic',
        stance: 'Supports the focused path if it still proves strategy depth.',
        objection: 'A polished room can still feel strategically thin if the room does not surface real conflict.',
        whatChangesMind: 'A sharper dissent board and action plan.',
        confidence: 7,
      },
    ],
    redTeamReport: {
      failureMode: 'The demo looks good but feels like a themed chatbot.',
      triggerSignals: ['Judges ask where the strategic rigor actually happens.'],
      mitigations: ['Show disagreement, scoring, and the action plan in one run.'],
    },
    actionPlan: [
      {
        title: 'Lock the winning story',
        owner: 'Strategy lead',
        timeframe: 'Day 1',
        successMetric: 'One-page demo arc agreed by the team.',
        dependencies: ['Winning option confirmed'],
      },
      {
        title: 'Stress-test the judge experience',
        owner: 'Product lead',
        timeframe: 'Day 2',
        successMetric: 'Every panel shows a strategic artifact, not just a transcript.',
        dependencies: ['Story locked'],
      },
    ],
    judgeNarrative: [
      'The council surfaces dissent before converging.',
      'The decision includes a red-team view and next actions.',
    ],
  }

  const script: CouncilEvent[] = [
    { type: 'session.started', members, prompt: 'Mock council run', ts: new Date().toISOString() },
    { type: 'stage.started', stage: 'first_opinions' },
    ...stageOneStart,
    ...stageOneDone,
    {
      type: 'stage.completed',
      stage: 'first_opinions',
      summary: 'Captured opening positions from the full council.',
    },
    { type: 'stage.started', stage: 'review' },
    ...stageTwoStart,
    ...stageTwoDone,
    {
      type: 'stage.completed',
      stage: 'review',
      summary: 'Peer review converged on the focused demo path as the strongest opening answer.',
    },
    { type: 'stage.started', stage: 'debate' },
    ...stageThreeStart,
    ...stageThreeDone,
    {
      type: 'stage.completed',
      stage: 'debate',
      summary: 'Debate exposed the risk of looking polished but strategically shallow.',
    },
    { type: 'stage.started', stage: 'options' },
    { type: 'member.started', memberId: primaryMemberId, stage: 'options', activity: 'thinking', detail: 'Drafting answer choices.' },
    { type: 'member.completed', memberId: primaryMemberId, stage: 'options', detail: '3 options prepared.' },
    {
      type: 'stage.completed',
      stage: 'options',
      summary: 'The chairman distilled the debate into three strategic paths.',
    },
    { type: 'stage.started', stage: 'vote' },
    ...stageVoteStart,
    ...stageVoteDone,
    {
      type: 'stage.completed',
      stage: 'vote',
      summary: 'Option A took the lead with the strongest first-choice support.',
    },
    { type: 'stage.started', stage: 'final_synthesis' },
    { type: 'member.started', memberId: primaryMemberId, stage: 'final_synthesis', activity: 'synthesizing' },
    { type: 'member.completed', memberId: primaryMemberId, stage: 'final_synthesis' },
    {
      type: 'stage.completed',
      stage: 'final_synthesis',
      summary: 'The room closed with a focused recommendation and a 7-day action plan.',
    },
    {
      type: 'session.completed',
      summary: 'Mock session complete',
      finalResponse: 'Option A wins because it balances delivery speed, product clarity, and demo reliability.',
      winningOption: {
        id: 'option_a',
        label: 'Option A',
        title: 'Ship the focused demo path',
        summary: 'Stabilize the live council flow and present the most polished room experience.',
      },
      options: [
        {
          id: 'option_a',
          label: 'Option A',
          title: 'Ship the focused demo path',
          summary: 'Stabilize the live council flow and present the most polished room experience.',
        },
        {
          id: 'option_b',
          label: 'Option B',
          title: 'Add broader feature depth',
          summary: 'Prioritize more features even if the demo gets noisier.',
        },
        {
          id: 'option_c',
          label: 'Option C',
          title: 'Optimize the host adapters first',
          summary: 'Spend the next cycle on parity and packaging before polishing the room.',
        },
      ],
      references: [
        {
          title: 'Hackathon Demo Playbook',
          url: 'https://example.com/demo-playbook',
          snippet: 'Strong demos focus on one clear narrative and visible proof of execution.',
        },
      ],
      optionRankings: [
        {
          optionId: 'option_a',
          label: 'Option A',
          title: 'Ship the focused demo path',
          averageRank: 1.0,
          rankingsCount: 4,
          firstChoiceVotes: 3,
        },
      ],
      strategyPacket,
    },
  ]

  function emit(event: CouncilEvent): void {
    for (const listener of listeners) {
      listener({ ...event, ts: event.ts ?? new Date().toISOString() })
    }
  }

  function schedule(): void {
    if (!running) return
    if (cursor >= script.length) {
      running = false
      return
    }
    emit(script[cursor])
    cursor += 1
    timer = window.setTimeout(schedule, stageDelayMs)
  }

  function connect(): void {
    if (running) return
    running = true
    cursor = 0
    schedule()
  }

  function disconnect(): void {
    running = false
    cursor = 0
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
  }

  function subscribe(listener: (event: CouncilEvent) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function send(message: unknown): void {
    if (
      typeof message === 'object'
      && message !== null
      && (message as { type?: unknown }).type === 'member.chat.send'
    ) {
      const payload = message as { memberId?: unknown; content?: unknown }
      const memberId = typeof payload.memberId === 'string' ? payload.memberId : ''
      const content = typeof payload.content === 'string' ? payload.content.trim() : ''
      if (!memberId || !content) {
        emit({
          type: 'member.chat.error',
          memberId: memberId || primaryMemberId,
          message: 'Member chat payload is missing memberId or content.',
        })
        return
      }

      emit({
        type: 'member.chat.message',
        memberId,
        role: 'user',
        content,
        messageId: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      })

      const nextTurn = (privateChatTurns.get(memberId) ?? 0) + 1
      privateChatTurns.set(memberId, nextTurn)
      const memberName = memberNameById.get(memberId) ?? memberId
      const reply =
        nextTurn % 2 === 1
          ? `${memberName}: I can factor that into my next vote, but I will still prioritize evidence and tradeoffs.`
          : `${memberName}: Noted. I updated my private reasoning context for this mission and will reflect it in my stance.`

      emit({
        type: 'member.chat.message',
        memberId,
        role: 'assistant',
        content: reply,
        messageId: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      })
      return
    }

    if (
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: unknown }).type === 'run'
    ) {
      disconnect()
      connect()
      return
    }
    if (
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: unknown }).type === 'ping'
    ) {
      emit({ type: 'heartbeat', ts: new Date().toISOString() })
    }
  }

  return {
    connect,
    disconnect,
    subscribe,
    send,
  }
}
