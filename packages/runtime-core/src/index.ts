export type RuntimeAgentStatus =
  | 'idle'
  | 'thinking'
  | 'reviewing'
  | 'debating'
  | 'voting'
  | 'synthesizing'
  | 'waiting'
  | 'done'
  | 'error'

export type CouncilReasoningEffort = 'none' | 'low' | 'medium' | 'high'

export interface RuntimeAgentState {
  agentId: number
  memberId: string
  displayName: string
  role: 'member' | 'chairman'
  status: RuntimeAgentStatus
  detail?: string
  terminalId?: string
}

export interface HostAdapterEvent {
  type: string
  [key: string]: unknown
}

export interface SpawnTerminalInput {
  agentId: number
  memberId: string
  displayName: string
  role: 'member' | 'chairman'
  cwd?: string
}

export interface SpawnTerminalResult {
  terminalId: string
}

export interface HostAdapter {
  start?: () => Promise<void> | void
  stop?: () => Promise<void> | void
  subscribe?: (listener: (event: HostAdapterEvent) => void) => () => void
  spawnTerminal?: (input: SpawnTerminalInput) => Promise<SpawnTerminalResult> | SpawnTerminalResult
  focusTerminal?: (terminalId: string) => Promise<void> | void
  closeTerminal?: (terminalId: string) => Promise<void> | void
  readLayout?: () => Promise<Record<string, unknown> | null> | Record<string, unknown> | null
  writeLayout?: (layout: Record<string, unknown>) => Promise<void> | void
  openExternal?: (url: string) => Promise<void> | void
}

export interface CouncilMemberDescriptor {
  id: string
  displayName: string
  role?: 'member' | 'chairman'
}

export type CouncilRuntimeEvent =
  | { type: 'session.started'; runId?: string; members: CouncilMemberDescriptor[] }
  | {
      type: 'member.started'
      runId?: string
      memberId: string
      activity?: 'thinking' | 'reviewing' | 'debating' | 'voting' | 'synthesizing'
      detail?: string
    }
  | { type: 'member.completed'; runId?: string; memberId: string; detail?: string }
  | { type: 'member.waiting'; runId?: string; memberId: string; reason?: string }
  | { type: 'member.error'; runId?: string; memberId: string; message: string }
  | { type: 'session.completed'; runId?: string; summary?: string }
  | { type: 'session.failed'; runId?: string; message: string }

export type RuntimeEvent =
  | { type: 'runtime.started' }
  | { type: 'runtime.stopped' }
  | { type: 'runtime.agent.created'; agent: RuntimeAgentState }
  | { type: 'runtime.agent.updated'; agent: RuntimeAgentState }
  | { type: 'runtime.agent.closed'; agentId: number }
  | { type: 'runtime.layout.loaded'; layout: Record<string, unknown> | null }
  | { type: 'runtime.layout.saved'; layout: Record<string, unknown> }
  | { type: 'runtime.host.event'; event: HostAdapterEvent }

export interface RuntimeCoreOptions {
  hostAdapter?: HostAdapter
  autoSpawnTerminals?: boolean
}

export interface RuntimeCore {
  start: () => Promise<void>
  stop: () => Promise<void>
  subscribeRuntimeEvents: (listener: (event: RuntimeEvent) => void) => () => void
  dispatchHostEvent: (event: HostAdapterEvent) => void
  dispatchCouncilEvent: (event: CouncilRuntimeEvent) => Promise<void>
  spawnAgent: (member: CouncilMemberDescriptor) => Promise<RuntimeAgentState>
  focusAgent: (agentId: number) => Promise<void>
  closeAgent: (agentId: number) => Promise<void>
  listAgents: () => RuntimeAgentState[]
  loadLayout: () => Promise<Record<string, unknown> | null>
  saveLayout: (layout: Record<string, unknown>) => Promise<void>
}

function activityToStatus(
  activity?: 'thinking' | 'reviewing' | 'debating' | 'voting' | 'synthesizing',
): RuntimeAgentStatus {
  if (activity === 'reviewing') return 'reviewing'
  if (activity === 'debating') return 'debating'
  if (activity === 'voting') return 'voting'
  if (activity === 'synthesizing') return 'synthesizing'
  return 'thinking'
}

class RuntimeCoreImpl implements RuntimeCore {
  private readonly listeners = new Set<(event: RuntimeEvent) => void>()
  private readonly agents = new Map<number, RuntimeAgentState>()
  private readonly byMember = new Map<string, number>()
  private readonly hostAdapter?: HostAdapter
  private readonly autoSpawnTerminals: boolean
  private nextAgentId = 1
  private hostUnsubscribe: (() => void) | null = null
  private activeRunId: string | null = null

  constructor(options: RuntimeCoreOptions) {
    this.hostAdapter = options.hostAdapter
    this.autoSpawnTerminals = options.autoSpawnTerminals !== false
  }

  private emit(event: RuntimeEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  private async closeAllAgents(): Promise<void> {
    const ids = [...this.agents.keys()]
    for (const agentId of ids) {
      await this.closeAgent(agentId)
    }
  }

  private shouldIgnoreEventRun(runId?: string): boolean {
    if (!runId) return false
    if (!this.activeRunId) {
      this.activeRunId = runId
      return false
    }
    return this.activeRunId !== runId
  }

  async start(): Promise<void> {
    await this.hostAdapter?.start?.()
    if (this.hostAdapter?.subscribe) {
      this.hostUnsubscribe = this.hostAdapter.subscribe((event) => {
        this.dispatchHostEvent(event)
      })
    }
    this.emit({ type: 'runtime.started' })
  }

  async stop(): Promise<void> {
    this.hostUnsubscribe?.()
    this.hostUnsubscribe = null
    await this.hostAdapter?.stop?.()
    this.emit({ type: 'runtime.stopped' })
  }

  subscribeRuntimeEvents(listener: (event: RuntimeEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  dispatchHostEvent(event: HostAdapterEvent): void {
    this.emit({ type: 'runtime.host.event', event })
  }

  async dispatchCouncilEvent(event: CouncilRuntimeEvent): Promise<void> {
    if (event.type === 'session.started') {
      const incomingRunId = event.runId?.trim() || null
      const isRunSwitch = incomingRunId !== null && this.activeRunId !== null && incomingRunId !== this.activeRunId
      if (isRunSwitch) {
        await this.closeAllAgents()
      }
      if (incomingRunId) {
        this.activeRunId = incomingRunId
      }
      for (const member of event.members) {
        if (this.byMember.has(member.id)) continue
        await this.spawnAgent(member)
      }
      return
    }

    if (this.shouldIgnoreEventRun(event.runId)) {
      return
    }

    if (event.type === 'session.completed') {
      for (const entry of this.agents.values()) {
        entry.status = 'done'
        entry.detail = event.summary
        this.emit({ type: 'runtime.agent.updated', agent: { ...entry } })
      }
      return
    }

    if (event.type === 'session.failed') {
      for (const entry of this.agents.values()) {
        entry.status = 'error'
        entry.detail = event.message
        this.emit({ type: 'runtime.agent.updated', agent: { ...entry } })
      }
      return
    }

    const agentId = this.byMember.get(event.memberId)
    if (!agentId) return
    const entry = this.agents.get(agentId)
    if (!entry) return

    if (event.type === 'member.started') {
      entry.status = activityToStatus(event.activity)
      entry.detail = event.detail
      this.emit({ type: 'runtime.agent.updated', agent: { ...entry } })
      return
    }
    if (event.type === 'member.completed') {
      entry.status = 'done'
      entry.detail = event.detail
      this.emit({ type: 'runtime.agent.updated', agent: { ...entry } })
      return
    }
    if (event.type === 'member.waiting') {
      entry.status = 'waiting'
      entry.detail = event.reason
      this.emit({ type: 'runtime.agent.updated', agent: { ...entry } })
      return
    }
    if (event.type === 'member.error') {
      entry.status = 'error'
      entry.detail = event.message
      this.emit({ type: 'runtime.agent.updated', agent: { ...entry } })
    }
  }

  async spawnAgent(member: CouncilMemberDescriptor): Promise<RuntimeAgentState> {
    const role = member.role === 'chairman' ? 'chairman' : 'member'
    const created: RuntimeAgentState = {
      agentId: this.nextAgentId++,
      memberId: member.id,
      displayName: member.displayName,
      role,
      status: 'idle',
    }
    if (this.autoSpawnTerminals && this.hostAdapter?.spawnTerminal) {
      const result = await this.hostAdapter.spawnTerminal({
        agentId: created.agentId,
        memberId: created.memberId,
        displayName: created.displayName,
        role: created.role,
      })
      created.terminalId = result.terminalId
    }
    this.agents.set(created.agentId, created)
    this.byMember.set(created.memberId, created.agentId)
    this.emit({ type: 'runtime.agent.created', agent: { ...created } })
    return { ...created }
  }

  async focusAgent(agentId: number): Promise<void> {
    const entry = this.agents.get(agentId)
    if (!entry?.terminalId) return
    await this.hostAdapter?.focusTerminal?.(entry.terminalId)
  }

  async closeAgent(agentId: number): Promise<void> {
    const entry = this.agents.get(agentId)
    if (!entry) return
    if (entry.terminalId) {
      await this.hostAdapter?.closeTerminal?.(entry.terminalId)
    }
    this.agents.delete(agentId)
    this.byMember.delete(entry.memberId)
    this.emit({ type: 'runtime.agent.closed', agentId })
  }

  listAgents(): RuntimeAgentState[] {
    return [...this.agents.values()].map((entry) => ({ ...entry }))
  }

  async loadLayout(): Promise<Record<string, unknown> | null> {
    const layout = (await this.hostAdapter?.readLayout?.()) ?? null
    this.emit({ type: 'runtime.layout.loaded', layout })
    return layout
  }

  async saveLayout(layout: Record<string, unknown>): Promise<void> {
    await this.hostAdapter?.writeLayout?.(layout)
    this.emit({ type: 'runtime.layout.saved', layout })
  }
}

export function createRuntime(options: RuntimeCoreOptions = {}): RuntimeCore {
  return new RuntimeCoreImpl(options)
}

export interface CouncilBridgeTransport {
  connect: () => void
  disconnect: () => void
  subscribe: (listener: (event: unknown) => void) => () => void
  send: (message: unknown) => void
}

export type CouncilBridgeDiagnosticCode =
  | 'event.unmapped'
  | 'event.out_of_order'
  | 'event.stale_run'

export interface CouncilBridgeDiagnosticEvent {
  type: 'bridge.diagnostic'
  code: CouncilBridgeDiagnosticCode
  reason: string
  eventType?: string
  runId?: string
  sequence?: number
}

export interface CouncilBridge {
  connect: () => void
  disconnect: () => void
  run: (prompt: string, runId?: string, options?: CouncilRunOptions) => string
  cancel: (runId?: string) => void
  subscribeDiagnostics: (listener: (event: CouncilBridgeDiagnosticEvent) => void) => () => void
}

export interface CouncilRunOptions {
  reasoningEffort?: CouncilReasoningEffort
}

export interface CouncilBridgeOptions {
  runtime: RuntimeCore
  transport: CouncilBridgeTransport
  createRunId?: () => string
  strictSequence?: boolean
}

interface NormalizedTransportEvent {
  type: string
  runId?: string
  sequence?: number
  payload: Record<string, unknown>
}

function defaultRunIdFactory(): string {
  const randomPart = Math.random().toString(36).slice(2, 10)
  return `run-${Date.now()}-${randomPart}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function maybeString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function maybeNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function normalizeLegacyType(rawType: string): string {
  if (rawType === 'complete') return 'session.completed'
  if (rawType === 'error') return 'session.failed'
  return rawType
}

function normalizeTransportEvent(raw: unknown): NormalizedTransportEvent | null {
  const payload = asRecord(raw)
  if (!payload) return null

  const explicitType = maybeString(payload.type)
  const legacyType = maybeString(payload.event)
  const type = explicitType ?? (legacyType ? normalizeLegacyType(legacyType) : undefined)
  if (!type) return null

  return {
    type,
    runId: maybeString(payload.runId),
    sequence: maybeNumber(payload.sequence),
    payload,
  }
}

function mapMembers(rawMembers: unknown): CouncilMemberDescriptor[] {
  if (!Array.isArray(rawMembers)) return []
  const members: CouncilMemberDescriptor[] = []

  for (const entry of rawMembers) {
    const member = asRecord(entry)
    if (!member) continue
    const id = maybeString(member.id)
    const displayName = maybeString(member.displayName)
    if (!id || !displayName) continue
    members.push({
      id,
      displayName,
      role: member.role === 'chairman' ? 'chairman' : 'member',
    })
  }

  return members
}

function mapToCouncilRuntimeEvent(
  event: NormalizedTransportEvent,
): CouncilRuntimeEvent | null {
  const { payload, runId } = event

  if (event.type === 'session.started') {
    return {
      type: 'session.started',
      runId,
      members: mapMembers(payload.members),
    }
  }

    if (event.type === 'member.started') {
      const memberId = maybeString(payload.memberId)
      if (!memberId) return null
      const activity = payload.activity
      const normalizedActivity =
      activity === 'reviewing'
      || activity === 'debating'
      || activity === 'voting'
      || activity === 'synthesizing'
      || activity === 'thinking'
        ? activity
        : undefined
    return {
      type: 'member.started',
      runId,
      memberId,
      activity: normalizedActivity,
      detail: maybeString(payload.detail),
    }
  }

  if (event.type === 'member.completed') {
    const memberId = maybeString(payload.memberId)
    if (!memberId) return null
    return {
      type: 'member.completed',
      runId,
      memberId,
      detail: maybeString(payload.detail),
    }
  }

  if (event.type === 'member.waiting') {
    const memberId = maybeString(payload.memberId)
    if (!memberId) return null
    return {
      type: 'member.waiting',
      runId,
      memberId,
      reason: maybeString(payload.reason),
    }
  }

  if (event.type === 'member.error') {
    const memberId = maybeString(payload.memberId)
    if (!memberId) return null
    return {
      type: 'member.error',
      runId,
      memberId,
      message: maybeString(payload.message) ?? 'Council member reported an error.',
    }
  }

  if (event.type === 'session.completed') {
    return {
      type: 'session.completed',
      runId,
      summary: maybeString(payload.summary),
    }
  }

  if (event.type === 'session.failed') {
    const message = maybeString(payload.message)
      ?? maybeString(asRecord((Array.isArray(payload.errors) ? payload.errors[0] : undefined))?.message)
      ?? 'Council run failed.'
    return {
      type: 'session.failed',
      runId,
      message,
    }
  }

  return null
}

class CouncilBridgeImpl implements CouncilBridge {
  private readonly runtime: RuntimeCore
  private readonly transport: CouncilBridgeTransport
  private readonly createRunId: () => string
  private readonly strictSequence: boolean
  private readonly diagnostics = new Set<(event: CouncilBridgeDiagnosticEvent) => void>()
  private readonly lastSequenceByRun = new Map<string, number>()
  private unsubscribeTransport: (() => void) | null = null
  private currentRunId: string | null = null
  private lastSequenceWithoutRun = 0
  private transportQueue: Promise<void> = Promise.resolve()

  constructor(options: CouncilBridgeOptions) {
    this.runtime = options.runtime
    this.transport = options.transport
    this.createRunId = options.createRunId ?? defaultRunIdFactory
    this.strictSequence = options.strictSequence !== false
  }

  private emitDiagnostic(event: CouncilBridgeDiagnosticEvent): void {
    for (const listener of this.diagnostics) {
      listener(event)
    }
  }

  private shouldDropForSequence(event: NormalizedTransportEvent): boolean {
    if (!this.strictSequence || event.sequence === undefined) return false

    if (event.runId) {
      const previous = this.lastSequenceByRun.get(event.runId) ?? 0
      if (event.sequence <= previous) {
        this.emitDiagnostic({
          type: 'bridge.diagnostic',
          code: 'event.out_of_order',
          reason: 'Dropped out-of-order event for runId.',
          eventType: event.type,
          runId: event.runId,
          sequence: event.sequence,
        })
        return true
      }
      this.lastSequenceByRun.set(event.runId, event.sequence)
      return false
    }

    if (event.sequence <= this.lastSequenceWithoutRun) {
      this.emitDiagnostic({
        type: 'bridge.diagnostic',
        code: 'event.out_of_order',
        reason: 'Dropped out-of-order event without runId.',
        eventType: event.type,
        sequence: event.sequence,
      })
      return true
    }

    this.lastSequenceWithoutRun = event.sequence
    return false
  }

  private shouldDropForRunScope(event: NormalizedTransportEvent): boolean {
    if (!event.runId || !this.currentRunId) return false
    if (event.type === 'session.started') return false
    if (event.runId === this.currentRunId) return false

    this.emitDiagnostic({
      type: 'bridge.diagnostic',
      code: 'event.stale_run',
      reason: 'Dropped stale event from a non-active runId.',
      eventType: event.type,
      runId: event.runId,
      sequence: event.sequence,
    })
    return true
  }

  private async handleTransportEvent(raw: unknown): Promise<void> {
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        await this.handleTransportEvent(entry)
      }
      return
    }

    const normalized = normalizeTransportEvent(raw)
    if (!normalized) return

    if (this.shouldDropForSequence(normalized)) {
      return
    }

    if (normalized.type === 'session.started' && normalized.runId) {
      this.currentRunId = normalized.runId
    }

    if (this.shouldDropForRunScope(normalized)) {
      return
    }

    if (
      normalized.type === 'heartbeat'
      || normalized.type === 'stage.started'
      || normalized.type === 'stage.completed'
    ) {
      return
    }

    const runtimeEvent = mapToCouncilRuntimeEvent(normalized)
    if (!runtimeEvent) {
      this.emitDiagnostic({
        type: 'bridge.diagnostic',
        code: 'event.unmapped',
        reason: 'Ignoring transport event that does not map to runtime.',
        eventType: normalized.type,
        runId: normalized.runId,
        sequence: normalized.sequence,
      })
      return
    }

    if (runtimeEvent.runId && !this.currentRunId) {
      this.currentRunId = runtimeEvent.runId
    }

    await this.runtime.dispatchCouncilEvent(runtimeEvent)
  }

  private enqueueTransportEvent(raw: unknown): void {
    this.transportQueue = this.transportQueue
      .catch(() => undefined)
      .then(() => this.handleTransportEvent(raw))
  }

  connect(): void {
    if (!this.unsubscribeTransport) {
      this.unsubscribeTransport = this.transport.subscribe((event) => {
        this.enqueueTransportEvent(event)
      })
    }
    this.transport.connect()
  }

  disconnect(): void {
    this.transport.disconnect()
    this.unsubscribeTransport?.()
    this.unsubscribeTransport = null
  }

  run(prompt: string, runId?: string, options?: CouncilRunOptions): string {
    const content = prompt.trim()
    const resolvedRunId = runId?.trim() || this.createRunId()
    this.currentRunId = resolvedRunId
    this.transport.send({
      type: 'run',
      runId: resolvedRunId,
      content,
      ...(options?.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}),
    })
    return resolvedRunId
  }

  cancel(runId?: string): void {
    const resolvedRunId = runId?.trim() || this.currentRunId || undefined
    if (resolvedRunId) {
      this.transport.send({ type: 'cancel', runId: resolvedRunId })
      return
    }
    this.transport.send({ type: 'cancel' })
  }

  subscribeDiagnostics(listener: (event: CouncilBridgeDiagnosticEvent) => void): () => void {
    this.diagnostics.add(listener)
    return () => {
      this.diagnostics.delete(listener)
    }
  }
}

export function createCouncilBridge(options: CouncilBridgeOptions): CouncilBridge {
  return new CouncilBridgeImpl(options)
}
