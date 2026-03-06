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

  const script: CouncilEvent[] = [
    { type: 'session.started', members, prompt: 'Mock council run', ts: new Date().toISOString() },
    { type: 'stage.started', stage: 'first_opinions' },
    ...stageOneStart,
    ...stageOneDone,
    { type: 'stage.completed', stage: 'first_opinions' },
    { type: 'stage.started', stage: 'review' },
    ...stageTwoStart,
    ...stageTwoDone,
    { type: 'stage.completed', stage: 'review' },
    { type: 'stage.started', stage: 'debate' },
    ...stageThreeStart,
    ...stageThreeDone,
    { type: 'stage.completed', stage: 'debate' },
    { type: 'stage.started', stage: 'options' },
    { type: 'member.started', memberId: primaryMemberId, stage: 'options', activity: 'thinking', detail: 'Drafting answer choices.' },
    { type: 'member.completed', memberId: primaryMemberId, stage: 'options', detail: '3 options prepared.' },
    { type: 'stage.completed', stage: 'options' },
    { type: 'stage.started', stage: 'vote' },
    ...stageVoteStart,
    ...stageVoteDone,
    { type: 'stage.completed', stage: 'vote' },
    { type: 'stage.started', stage: 'final_synthesis' },
    { type: 'member.started', memberId: primaryMemberId, stage: 'final_synthesis', activity: 'synthesizing' },
    { type: 'member.completed', memberId: primaryMemberId, stage: 'final_synthesis' },
    { type: 'stage.completed', stage: 'final_synthesis' },
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
