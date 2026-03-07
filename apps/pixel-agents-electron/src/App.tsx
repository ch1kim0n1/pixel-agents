import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  COUNCIL_STAGE_ORDER,
  CouncilActionBanner,
  CouncilLaunchCard,
  CouncilMissionLog,
  CouncilOutcomePanel,
  CouncilProgressPanel,
  CouncilRosterPanel,
  PixelCouncilRoom,
  buildCouncilStageRail,
  buildMissionLogEntries,
  connectCouncilRoomWebSocket,
  councilStatusLabel,
  councilStatusTone,
  createMockCouncilConnection,
  deriveCouncilMilestone,
  deriveCouncilNextAction,
  getCouncilActionBannerCopy,
  type CouncilEvent,
  type CouncilEventConnection,
  type CouncilMemberDescriptor,
  type CouncilOutcomeSummary,
  type CouncilRosterEntry,
  type CouncilStage,
  type CouncilUxSessionState,
  type CouncilUxTransportState,
} from '@pixel-agents/council-room'
import {
  createCouncilBridge,
  type CouncilReasoningEffort,
  createRuntime,
  type CouncilBridgeDiagnosticEvent,
  type CouncilBridge,
  type RuntimeAgentState,
  type RuntimeCore,
} from '@pixel-agents/runtime-core'
import { createElectronHostAdapter } from './runtime/electronHostAdapter.js'

interface ConnectionFormState {
  wsUrl: string
}

interface ActiveConnectionConfig {
  wsUrl: string
}

interface TerminalBufferState {
  terminalId: string
  label: string
  output: string
}

type CouncilWindowId = 'mission' | 'progress' | 'outcome' | 'roster' | 'log' | 'ops'

interface CouncilWindowLayout {
  x: number
  y: number
  width: number
  z: number
  hidden: boolean
  minimized: boolean
}

type CouncilWindowLayoutMap = Record<CouncilWindowId, CouncilWindowLayout>

interface WindowDragState {
  windowId: CouncilWindowId
  startX: number
  startY: number
  originX: number
  originY: number
}

interface DirectChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  ts: string
}

type TransportState = CouncilUxTransportState
type SessionState = CouncilUxSessionState

const DEFAULT_FORM: ConnectionFormState = {
  wsUrl: (import.meta.env.VITE_COUNCIL_WS_URL || 'ws://127.0.0.1:8001/v1/council-room/ws').trim(),
}

const COUNCIL_TOKEN = (import.meta.env.VITE_COUNCIL_TOKEN || '').trim()
const DEFAULT_PROMPT = 'Evaluate our hackathon pitch and propose execution priorities.'
const TERMINAL_FLUSH_MS = 50
const ROOM_ZOOM_OPTIONS = [2.5, 3, 3.5, 4, 4.5, 5] as const
const WINDOW_LAYOUT_STORAGE_KEY = 'cometroom-floating-window-layout-v1'
const DEFAULT_ROOM_ZOOM = (() => {
  const parsed = Number(import.meta.env.VITE_COUNCIL_ROOM_ZOOM || 3.5)
  if (!Number.isFinite(parsed)) return 3.5
  return Math.max(2.5, Math.min(6, parsed))
})()

const COUNCIL_WINDOW_IDS: CouncilWindowId[] = [
  'mission',
  'progress',
  'outcome',
  'roster',
  'log',
  'ops',
]

const COUNCIL_WINDOW_TITLES: Record<CouncilWindowId, string> = {
  mission: 'Mission Control',
  progress: 'Quest Progress',
  outcome: 'Decision Deck',
  roster: 'Council Roster',
  log: 'Mission Log',
  ops: 'Ops Console',
}

const WINDOW_DEFAULT_LAYOUT: CouncilWindowLayoutMap = {
  mission: { x: 18, y: 18, width: 492, z: 20, hidden: false, minimized: false },
  progress: { x: 526, y: 18, width: 372, z: 21, hidden: false, minimized: false },
  outcome: { x: 526, y: 328, width: 398, z: 22, hidden: false, minimized: false },
  roster: { x: 18, y: 476, width: 372, z: 23, hidden: false, minimized: false },
  log: { x: 404, y: 476, width: 412, z: 24, hidden: false, minimized: false },
  ops: { x: 914, y: 18, width: 422, z: 25, hidden: false, minimized: false },
}

const REASONING_LABELS: Record<CouncilReasoningEffort, string> = {
  none: 'Off',
  low: 'Light',
  medium: 'Balanced',
  high: 'Deep',
}

function normalizeForm(form: ConnectionFormState): ConnectionFormState {
  return {
    wsUrl: form.wsUrl.trim(),
  }
}

function toConnectionConfig(form: ConnectionFormState): ActiveConnectionConfig {
  return {
    wsUrl: form.wsUrl.trim(),
  }
}

function buildConnection(
  config: ActiveConnectionConfig,
  onTransportError: (error: string) => void,
): CouncilEventConnection {
  if (!config.wsUrl) return createMockCouncilConnection()
  return connectCouncilRoomWebSocket({
    url: config.wsUrl,
    token: COUNCIL_TOKEN || undefined,
    onTransportError,
  })
}

function appendOutput(current: string, chunk: string): string {
  const next = `${current}${chunk}`
  if (next.length <= 24_000) return next
  return next.slice(next.length - 24_000)
}

function formatRunId(runId: string | null): string {
  if (!runId) return 'No active run'
  if (runId.length <= 18) return runId
  return `${runId.slice(0, 8)}...${runId.slice(-6)}`
}

function formatChatTimestamp(rawTs: string): string {
  const parsed = new Date(rawTs)
  if (Number.isNaN(parsed.valueOf())) return ''
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function composeFollowUpPrompt(
  prompt: string,
  latestQuestion: string | null,
  lastSummary: string | null,
): string {
  const content = prompt.trim()
  if (!content) return ''

  const context: string[] = []
  if (latestQuestion) {
    context.push(`Previous council clarification request: ${latestQuestion}`)
  }
  if (lastSummary) {
    context.push(`Previous council summary: ${lastSummary}`)
  }
  if (context.length === 0) return content
  return `${context.join('\n')}\n\nUser follow-up for the next council run:\n${content}`
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

function cloneWindowLayoutMap(layout: CouncilWindowLayoutMap): CouncilWindowLayoutMap {
  const next = {} as CouncilWindowLayoutMap
  for (const windowId of COUNCIL_WINDOW_IDS) {
    next[windowId] = { ...layout[windowId] }
  }
  return next
}

function loadWindowLayoutMap(): CouncilWindowLayoutMap {
  const defaults = cloneWindowLayoutMap(WINDOW_DEFAULT_LAYOUT)
  if (typeof window === 'undefined') return defaults

  try {
    const raw = window.localStorage.getItem(WINDOW_LAYOUT_STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<Record<CouncilWindowId, Partial<CouncilWindowLayout>>>

    for (const windowId of COUNCIL_WINDOW_IDS) {
      const candidate = parsed[windowId]
      if (!candidate || typeof candidate !== 'object') continue

      const fallback = defaults[windowId]
      const width = typeof candidate.width === 'number' ? candidate.width : fallback.width
      const x = typeof candidate.x === 'number' ? candidate.x : fallback.x
      const y = typeof candidate.y === 'number' ? candidate.y : fallback.y
      const z = typeof candidate.z === 'number' ? candidate.z : fallback.z
      const hidden = typeof candidate.hidden === 'boolean' ? candidate.hidden : fallback.hidden
      const minimized = typeof candidate.minimized === 'boolean' ? candidate.minimized : fallback.minimized

      defaults[windowId] = {
        x,
        y,
        width,
        z,
        hidden,
        minimized,
      }
    }
  } catch {
    return defaults
  }

  return defaults
}

export default function App() {
  const [form, setForm] = useState<ConnectionFormState>(DEFAULT_FORM)
  const [activeConfig, setActiveConfig] = useState<ActiveConnectionConfig>(
    toConnectionConfig(DEFAULT_FORM),
  )
  const [connection, setConnection] = useState<CouncilEventConnection>(() =>
    createMockCouncilConnection(),
  )
  const [runtimeReady, setRuntimeReady] = useState(false)
  const [missionPrompt, setMissionPrompt] = useState(DEFAULT_PROMPT)
  const [reasoningEffort, setReasoningEffort] = useState<CouncilReasoningEffort>('high')
  const [latestQuestion, setLatestQuestion] = useState<string | null>(null)
  const [lastSummary, setLastSummary] = useState<string | null>(null)
  const [transportState, setTransportState] = useState<TransportState>('disconnected')
  const [transportMessage, setTransportMessage] = useState('Waiting for connection settings.')
  const [sessionState, setSessionState] = useState<SessionState>('idle')
  const [activeStage, setActiveStage] = useState<CouncilStage | null>(null)
  const [completedStages, setCompletedStages] = useState<Set<CouncilStage>>(() => new Set())
  const [sessionFeed, setSessionFeed] = useState<string[]>([])
  const [agents, setAgents] = useState<RuntimeAgentState[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [terminalBuffers, setTerminalBuffers] = useState<Record<string, TerminalBufferState>>(
    {},
  )
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [roomZoom, setRoomZoom] = useState<number>(DEFAULT_ROOM_ZOOM)
  const [sessionOutcome, setSessionOutcome] = useState<CouncilOutcomeSummary | null>(null)
  const [memberDirectory, setMemberDirectory] = useState<Record<string, CouncilMemberDescriptor>>(
    {},
  )
  const [hadWaiting, setHadWaiting] = useState(false)
  const [hadError, setHadError] = useState(false)
  const [wasInterrupted, setWasInterrupted] = useState(false)
  const [windowLayout, setWindowLayout] = useState<CouncilWindowLayoutMap>(() =>
    loadWindowLayoutMap(),
  )
  const [directChatMemberId, setDirectChatMemberId] = useState<string | null>(null)
  const [directChatDraft, setDirectChatDraft] = useState('')
  const [directChatByMemberId, setDirectChatByMemberId] = useState<Record<string, DirectChatMessage[]>>(
    {},
  )
  const [directChatPendingByMemberId, setDirectChatPendingByMemberId] = useState<
    Record<string, boolean>
  >({})

  const runtimeRef = useRef<RuntimeCore | null>(null)
  const councilBridgeRef = useRef<CouncilBridge | null>(null)
  const activeTerminalIdRef = useRef<string | null>(null)
  const memberNamesRef = useRef<Record<string, string>>({})
  const pendingTerminalUpdatesRef = useRef<
    Record<string, { label: string; chunks: string[] }>
  >({})
  const terminalFlushTimerRef = useRef<number | null>(null)
  const dragStateRef = useRef<WindowDragState | null>(null)
  const zCounterRef = useRef<number>(40)
  const directChatScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    activeTerminalIdRef.current = activeTerminalId
  }, [activeTerminalId])

  useEffect(() => {
    const maxZ = Object.values(windowLayout).reduce((highest, entry) => Math.max(highest, entry.z), 0)
    zCounterRef.current = Math.max(zCounterRef.current, maxZ)
  }, [windowLayout])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(WINDOW_LAYOUT_STORAGE_KEY, JSON.stringify(windowLayout))
    } catch {
      // Best effort only; layout persistence is optional.
    }
  }, [windowLayout])

  useEffect(() => {
    const clampToViewport = () => {
      setWindowLayout((prev) => {
        let changed = false
        const next = cloneWindowLayoutMap(prev)

        for (const windowId of COUNCIL_WINDOW_IDS) {
          const current = next[windowId]
          const maxWidth = Math.max(280, window.innerWidth - 24)
          const width = clamp(current.width, 280, maxWidth)
          const maxX = Math.max(12, window.innerWidth - width - 12)
          const maxY = Math.max(12, window.innerHeight - (current.minimized ? 62 : 196))
          const x = clamp(current.x, 12, maxX)
          const y = clamp(current.y, 12, maxY)

          if (width !== current.width || x !== current.x || y !== current.y) {
            next[windowId] = { ...current, width, x, y }
            changed = true
          }
        }

        return changed ? next : prev
      })
    }

    clampToViewport()
    window.addEventListener('resize', clampToViewport)
    return () => {
      window.removeEventListener('resize', clampToViewport)
    }
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current
      if (!drag) return

      setWindowLayout((prev) => {
        const current = prev[drag.windowId]
        if (!current) return prev

        const dx = event.clientX - drag.startX
        const dy = event.clientY - drag.startY
        const maxX = Math.max(12, window.innerWidth - current.width - 12)
        const maxY = Math.max(12, window.innerHeight - (current.minimized ? 62 : 196))
        const x = clamp(drag.originX + dx, 12, maxX)
        const y = clamp(drag.originY + dy, 12, maxY)

        if (x === current.x && y === current.y) return prev
        return {
          ...prev,
          [drag.windowId]: {
            ...current,
            x,
            y,
          },
        }
      })
    }

    const stopDrag = () => {
      dragStateRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDrag)
      window.removeEventListener('pointercancel', stopDrag)
    }
  }, [])

  function appendFeed(line: string): void {
    setSessionFeed((prev) => [line, ...prev].slice(0, 12))
  }

  function flushTerminalUpdates(): void {
    terminalFlushTimerRef.current = null
    const pending = pendingTerminalUpdatesRef.current
    pendingTerminalUpdatesRef.current = {}
    const terminalIds = Object.keys(pending)
    if (terminalIds.length === 0) return

    setTerminalBuffers((prev) => {
      const next = { ...prev }
      for (const terminalId of terminalIds) {
        const update = pending[terminalId]
        if (!update) continue
        const existing = next[terminalId]
        next[terminalId] = {
          terminalId,
          label: update.label,
          output: appendOutput(existing?.output || '', update.chunks.join('')),
        }
      }
      return next
    })
  }

  function scheduleTerminalFlush(): void {
    if (terminalFlushTimerRef.current !== null) return
    terminalFlushTimerRef.current = window.setTimeout(flushTerminalUpdates, TERMINAL_FLUSH_MS)
  }

  function queueTerminalChunk(terminalId: string, label: string, chunk: string): void {
    const pending = pendingTerminalUpdatesRef.current
    const existing = pending[terminalId]
    if (existing) {
      existing.label = label
      existing.chunks.push(chunk)
    } else {
      pending[terminalId] = { label, chunks: [chunk] }
    }
    scheduleTerminalFlush()
  }

  function resetSessionPresentation(): void {
    memberNamesRef.current = {}
    setSessionState('idle')
    setActiveStage(null)
    setCompletedStages(new Set())
    setSessionFeed([])
    setLatestQuestion(null)
    setLastSummary(null)
    setActiveRunId(null)
    setSelectedMemberId(null)
    setSessionOutcome(null)
    setMemberDirectory({})
    setHadWaiting(false)
    setHadError(false)
    setWasInterrupted(false)
    setDirectChatMemberId(null)
    setDirectChatDraft('')
    setDirectChatByMemberId({})
    setDirectChatPendingByMemberId({})
  }

  async function clearRuntimeSurface(): Promise<void> {
    const runtime = runtimeRef.current
    if (runtime) {
      const existingAgents = runtime.listAgents()
      for (const agent of existingAgents) {
        await runtime.closeAgent(agent.agentId)
      }
    }
    if (terminalFlushTimerRef.current !== null) {
      window.clearTimeout(terminalFlushTimerRef.current)
      terminalFlushTimerRef.current = null
    }
    pendingTerminalUpdatesRef.current = {}
    activeTerminalIdRef.current = null
    setAgents([])
    setTerminalBuffers({})
    setActiveTerminalId(null)
  }

  useEffect(() => {
    const hostAdapter = createElectronHostAdapter()
    const runtime = createRuntime({
      hostAdapter,
      autoSpawnTerminals: true,
    })
    runtimeRef.current = runtime

    let disposed = false
    const unsubscribeRuntime = runtime.subscribeRuntimeEvents((event) => {
      if (disposed) return

      if (
        event.type === 'runtime.agent.created'
        || event.type === 'runtime.agent.updated'
        || event.type === 'runtime.agent.closed'
      ) {
        setAgents(runtime.listAgents())
      }

      if (
        event.type === 'runtime.agent.created'
        && event.agent.terminalId
        && !activeTerminalIdRef.current
      ) {
        setActiveTerminalId(event.agent.terminalId)
      }

      if (event.type === 'runtime.host.event') {
        if (event.event.type === 'host.terminal.data') {
          const terminalId = String(event.event.terminalId || '')
          const data = String(event.event.data || '')
          const label = String(event.event.label || terminalId)
          if (!terminalId || !data) return
          queueTerminalChunk(terminalId, label, data)
          return
        }

        if (event.event.type === 'host.terminal.exit') {
          const terminalId = String(event.event.terminalId || '')
          const label = String(event.event.label || terminalId)
          if (!terminalId) return
          queueTerminalChunk(
            terminalId,
            label,
            `\n[terminal exited code=${String(event.event.exitCode ?? '')}]`,
          )
        }
      }
    })

    void runtime.start()
      .then(() => {
        if (!disposed) {
          setRuntimeReady(true)
        }
      })
      .catch((error: unknown) => {
        if (disposed) return
        const message = error instanceof Error ? error.message : 'Runtime failed to start.'
        setTransportState('error')
        setTransportMessage(message)
      })

    return () => {
      disposed = true
      setRuntimeReady(false)
      unsubscribeRuntime()
      if (terminalFlushTimerRef.current !== null) {
        window.clearTimeout(terminalFlushTimerRef.current)
        terminalFlushTimerRef.current = null
      }
      pendingTerminalUpdatesRef.current = {}
      void runtime.stop()
      hostAdapter.dispose()
      runtimeRef.current = null
      councilBridgeRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!runtimeReady || !runtimeRef.current) return

    let disposed = false
    let activeConnection: CouncilEventConnection | null = null

    const cleanupRef = { current: null as null | (() => void) }

    const prepareConnection = async () => {
      await clearRuntimeSurface()
      if (disposed || !runtimeRef.current) return

      resetSessionPresentation()

      const nextConnection = buildConnection(activeConfig, (error) => {
        if (disposed) return
        setTransportState('error')
        setTransportMessage(error)
      })

      activeConnection = nextConnection
      setConnection(nextConnection)
      setTransportState(activeConfig.wsUrl ? 'connecting' : 'connected')
      setTransportMessage(
        activeConfig.wsUrl
          ? `Connecting to ${activeConfig.wsUrl}`
          : 'Using the built-in council demo stream.',
      )

      const councilBridge = createCouncilBridge({
        runtime: runtimeRef.current,
        transport: nextConnection,
        strictSequence: true,
      })
      councilBridgeRef.current = councilBridge

      const unsubscribeDiagnostics = councilBridge.subscribeDiagnostics(
        (event: CouncilBridgeDiagnosticEvent) => {
          if (!disposed) {
            console.warn('[CouncilBridge]', event.code, event.reason, event.runId ?? '')
            setTransportMessage(`Bridge: ${event.reason}`)
          }
        },
      )

      const unsubscribeConnection = nextConnection.subscribe((event: CouncilEvent) => {
        if (disposed) return

        const displayNameFor = (memberId: string): string =>
          memberNamesRef.current[memberId] ?? memberId

        if (event.type === 'heartbeat') {
          setTransportState('connected')
          setTransportMessage(
            activeConfig.wsUrl
              ? 'Live council stream ready.'
              : 'Demo council stream ready.',
          )
          return
        }

        if (event.type === 'session.started') {
          const names: Record<string, string> = {}
          const directory: Record<string, CouncilMemberDescriptor> = {}
          for (const member of event.members) {
            names[member.id] = member.displayName
            directory[member.id] = member
          }
          memberNamesRef.current = names
          setMemberDirectory(directory)
          setSessionState('running')
          setActiveRunId(event.runId ?? null)
          setActiveStage(null)
          setCompletedStages(new Set())
          setSessionFeed(['Council session started.'])
          setLatestQuestion(null)
          setLastSummary(null)
          setSessionOutcome(null)
          setSelectedMemberId(
            event.members.find((member) => member.role === 'chairman')?.id
              ?? event.members[0]?.id
              ?? null,
          )
          setHadWaiting(false)
          setHadError(false)
          setWasInterrupted(false)
          return
        }

        if (event.type === 'stage.started') {
          setSessionState('running')
          setActiveStage(event.stage)
          appendFeed(`${event.stage.replaceAll('_', ' ')} started.`)
          return
        }

        if (event.type === 'stage.completed') {
          setCompletedStages((prev) => new Set([...prev, event.stage]))
          setActiveStage((prev) => (prev === event.stage ? null : prev))
          appendFeed(`${event.stage.replaceAll('_', ' ')} completed.`)
          return
        }

        if (event.type === 'member.started') {
          appendFeed(`${displayNameFor(event.memberId)} is ${event.activity ?? 'thinking'}.`)
          return
        }

        if (event.type === 'member.completed') {
          appendFeed(`${displayNameFor(event.memberId)} completed ${event.stage.replaceAll('_', ' ')}.`)
          return
        }

        if (event.type === 'member.waiting') {
          const reason = event.reason?.trim() || `${displayNameFor(event.memberId)} needs clarification.`
          setSessionState('awaiting_input')
          setLatestQuestion(reason)
          setHadWaiting(true)
          appendFeed(reason)
          return
        }

        if (event.type === 'member.error') {
          setHadError(true)
          appendFeed(`${displayNameFor(event.memberId)} hit an error: ${event.message}`)
          return
        }

        if (event.type === 'member.chat.message') {
          setDirectChatByMemberId((prev) => {
            const existing = prev[event.memberId] ?? []
            if (event.messageId && existing.some((entry) => entry.id === event.messageId)) {
              return prev
            }
            const nextMessage: DirectChatMessage = {
              id: event.messageId || `${event.memberId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              role: event.role,
              content: event.content,
              ts: event.ts || new Date().toISOString(),
            }
            return {
              ...prev,
              [event.memberId]: [...existing, nextMessage],
            }
          })
          if (event.role === 'assistant' || event.role === 'system') {
            setDirectChatPendingByMemberId((prev) => ({
              ...prev,
              [event.memberId]: false,
            }))
          }
          return
        }

        if (event.type === 'member.chat.error') {
          setDirectChatPendingByMemberId((prev) => ({
            ...prev,
            [event.memberId]: false,
          }))
          setTransportMessage(event.message)
          appendFeed(`Private chat error (${displayNameFor(event.memberId)}): ${event.message}`)
          return
        }

        if (event.type === 'session.completed') {
          setSessionState('completed')
          setActiveStage(null)
          setCompletedStages(new Set(COUNCIL_STAGE_ORDER))
          setLatestQuestion(null)
          setLastSummary(event.summary?.trim() || null)
          setSessionOutcome({
            finalResponse: event.finalResponse?.trim() || event.summary?.trim() || '',
            winningOption: event.winningOption ?? null,
            options: event.options ?? [],
            references: event.references ?? [],
            optionRankings: event.optionRankings ?? [],
            strategyPacket: event.strategyPacket ?? null,
          })
          appendFeed(
            event.winningOption
              ? `Council session completed. Winner: ${event.winningOption.label} (${event.winningOption.title}).`
              : 'Council session completed.',
          )
          return
        }

        if (event.type === 'session.failed') {
          setWasInterrupted(true)
          setSessionState('failed')
          setActiveStage(null)
          setLatestQuestion(null)
          setDirectChatPendingByMemberId({})
          appendFeed(`Run failed: ${event.message}`)
        }
      })

      councilBridge.connect()

      cleanupRef.current = () => {
        if (councilBridgeRef.current === councilBridge) {
          councilBridgeRef.current = null
        }
        councilBridge.disconnect()
        unsubscribeConnection()
        unsubscribeDiagnostics()
      }
    }

    void prepareConnection()

    return () => {
      disposed = true
      cleanupRef.current?.()
      activeConnection?.disconnect()
    }
  }, [activeConfig, runtimeReady])

  useEffect(() => {
    if (selectedMemberId && agents.some((agent) => agent.memberId === selectedMemberId)) return
    if (selectedMemberId) {
      setSelectedMemberId(null)
    }
  }, [agents, selectedMemberId])

  useEffect(() => {
    if (!directChatMemberId) return
    if (memberDirectory[directChatMemberId]) return
    setDirectChatMemberId(null)
    setDirectChatDraft('')
  }, [directChatMemberId, memberDirectory])

  useEffect(() => {
    if (!directChatMemberId) return
    const node = directChatScrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [directChatByMemberId, directChatMemberId, directChatPendingByMemberId])

  const sortedAgents = useMemo(
    () => [...agents].sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === 'chairman' ? -1 : 1
      }
      return left.displayName.localeCompare(right.displayName)
    }),
    [agents],
  )

  const terminalList = useMemo(
    () =>
      Object.values(terminalBuffers).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    [terminalBuffers],
  )

  const rosterEntries = useMemo<CouncilRosterEntry[]>(
    () =>
      sortedAgents.map((agent) => ({
        id: agent.memberId,
        displayName: agent.displayName,
        role: agent.role,
        status: agent.status,
        statusLabel: councilStatusLabel(agent.status),
        tone: councilStatusTone(agent.status),
        detail: agent.detail || undefined,
        personaName: memberDirectory[agent.memberId]?.personaName,
        personaSummary: memberDirectory[agent.memberId]?.personaSummary,
      })),
    [memberDirectory, sortedAgents],
  )

  const activeTerminal = activeTerminalId ? terminalBuffers[activeTerminalId] : null
  const stageItems = buildCouncilStageRail(COUNCIL_STAGE_ORDER, activeStage, completedStages)
  const missionLogEntries = buildMissionLogEntries(sessionFeed)
  const nextAction = deriveCouncilNextAction(transportState, sessionState)
  const milestone = deriveCouncilMilestone({
    sessionState,
    hadWaiting,
    hadError,
    wasInterrupted,
  })
  const bannerCopy = getCouncilActionBannerCopy(nextAction, {
    transportMessage,
    latestQuestion,
    lastSummary,
  })

  const canStartRun = transportState === 'connected' && sessionState !== 'running'
  const canCancelRun = transportState === 'connected' && sessionState === 'running' && !!activeRunId
  const activeDirectChatMember = directChatMemberId ? memberDirectory[directChatMemberId] : null
  const activeDirectChatMessages = directChatMemberId
    ? (directChatByMemberId[directChatMemberId] ?? [])
    : []
  const activeDirectChatPending = directChatMemberId
    ? (directChatPendingByMemberId[directChatMemberId] ?? false)
    : false

  function handleApplyConnection(): void {
    const normalized = normalizeForm(form)
    setForm(normalized)
    setActiveConfig(toConnectionConfig(normalized))
  }

  function handleStartRun(): void {
    const prompt = missionPrompt.trim()
    if (!prompt) {
      setTransportMessage('Enter a mission prompt before starting the council run.')
      return
    }
    if (!canStartRun) {
      setTransportMessage('Wait for the current run to finish or reconnect first.')
      return
    }
    const content =
      nextAction === 'clarify' || nextAction === 'rerun'
        ? composeFollowUpPrompt(prompt, latestQuestion, lastSummary)
        : prompt
    const runId = councilBridgeRef.current?.run(content, undefined, {
      reasoningEffort,
    })
    if (runId) {
      setActiveRunId(runId)
      setSessionState('running')
      setTransportMessage(
        `Run started (${formatRunId(runId)}), reasoning ${REASONING_LABELS[reasoningEffort].toLowerCase()}.`,
      )
    }
  }

  function handleCancelRun(): void {
    councilBridgeRef.current?.cancel(activeRunId ?? undefined)
    setWasInterrupted(true)
    setSessionState('failed')
    setTransportMessage('Cancellation requested.')
  }

  function handleSelectMember(memberId: string): void {
    setSelectedMemberId(memberId)
    const agent = agents.find((entry) => entry.memberId === memberId)
    if (!agent) return
    void runtimeRef.current?.focusAgent(agent.agentId)
    if (agent.terminalId) {
      setActiveTerminalId(agent.terminalId)
    }
  }

  function openMemberDirectChat(memberId: string): void {
    handleSelectMember(memberId)
    setDirectChatMemberId(memberId)
    setDirectChatDraft('')
  }

  function closeMemberDirectChat(): void {
    setDirectChatMemberId(null)
    setDirectChatDraft('')
  }

  function sendDirectChatMessage(): void {
    const memberId = directChatMemberId
    if (!memberId) return
    const content = directChatDraft.trim()
    if (!content) return

    connection.send({
      type: 'member.chat.send',
      runId: activeRunId ?? undefined,
      memberId,
      content,
    })

    setDirectChatDraft('')
    setDirectChatPendingByMemberId((prev) => ({
      ...prev,
      [memberId]: true,
    }))
  }

  function handleSendDirectChatMessage(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    sendDirectChatMessage()
  }

  function handleSelectTerminal(terminalId: string): void {
    setActiveTerminalId(terminalId)
    const agent = agents.find((entry) => entry.terminalId === terminalId)
    if (agent) {
      setSelectedMemberId(agent.memberId)
    }
  }

  function handleBannerAction(): void {
    if (nextAction === 'connect') {
      handleApplyConnection()
      return
    }
    if (nextAction === 'start_run' || nextAction === 'clarify' || nextAction === 'rerun') {
      handleStartRun()
    }
  }

  function bringWindowToFront(windowId: CouncilWindowId): void {
    setWindowLayout((prev) => {
      const current = prev[windowId]
      if (!current) return prev
      const nextZ = zCounterRef.current + 1
      zCounterRef.current = nextZ
      return {
        ...prev,
        [windowId]: {
          ...current,
          z: nextZ,
        },
      }
    })
  }

  function openWindow(windowId: CouncilWindowId): void {
    setWindowLayout((prev) => {
      const current = prev[windowId]
      if (!current) return prev
      const nextZ = zCounterRef.current + 1
      zCounterRef.current = nextZ
      return {
        ...prev,
        [windowId]: {
          ...current,
          hidden: false,
          minimized: false,
          z: nextZ,
        },
      }
    })
  }

  function hideWindow(windowId: CouncilWindowId): void {
    setWindowLayout((prev) => {
      const current = prev[windowId]
      if (!current || current.hidden) return prev
      return {
        ...prev,
        [windowId]: {
          ...current,
          hidden: true,
          minimized: false,
        },
      }
    })
  }

  function toggleWindowMinimized(windowId: CouncilWindowId): void {
    setWindowLayout((prev) => {
      const current = prev[windowId]
      if (!current) return prev
      const nextZ = zCounterRef.current + 1
      zCounterRef.current = nextZ
      return {
        ...prev,
        [windowId]: {
          ...current,
          minimized: !current.minimized,
          hidden: false,
          z: nextZ,
        },
      }
    })
  }

  function resetWindowLayout(): void {
    setWindowLayout(cloneWindowLayoutMap(WINDOW_DEFAULT_LAYOUT))
  }

  function handleWindowHeaderPointerDown(
    windowId: CouncilWindowId,
    event: ReactPointerEvent<HTMLElement>,
  ): void {
    if (event.button !== 0) return
    const current = windowLayout[windowId]
    if (!current) return
    event.preventDefault()
    dragStateRef.current = {
      windowId,
      startX: event.clientX,
      startY: event.clientY,
      originX: current.x,
      originY: current.y,
    }
  }

  function renderWindowContent(windowId: CouncilWindowId): ReactNode {
    switch (windowId) {
      case 'mission':
        return (
          <div className="electron-window-stack">
            <CouncilActionBanner
              copy={bannerCopy}
              onAction={bannerCopy.actionLabel ? handleBannerAction : undefined}
              actionDisabled={
                nextAction === 'connect'
                  ? transportState === 'connecting'
                  : nextAction === 'start_run' || nextAction === 'clarify' || nextAction === 'rerun'
                    ? !canStartRun
                    : false
              }
            />
            <CouncilLaunchCard
              title={nextAction === 'clarify' ? 'Clarify The Mission' : nextAction === 'rerun' ? 'Relaunch The Mission' : 'Launch A Council Run'}
              description="Use one launcher for the first run, clarification loops, and retries."
              promptLabel="Mission Prompt"
              promptValue={missionPrompt}
              onPromptChange={setMissionPrompt}
              promptPlaceholder="Ask the council for a plan, critique, or decision."
              helperText="Include the outcome you want, the constraints that matter, and any context the chairman should preserve across reruns."
              primaryAction={{
                label:
                  nextAction === 'clarify'
                    ? 'Clarify And Rerun'
                    : nextAction === 'rerun'
                      ? 'Retry Mission'
                      : 'Start Run',
                onClick: handleStartRun,
                disabled: !canStartRun,
              }}
              secondaryAction={{
                label: 'Cancel Run',
                onClick: handleCancelRun,
                disabled: !canCancelRun,
              }}
              topSlot={(
                <div className="electron-launch-status">
                  <div className="electron-launch-summary">
                    <div>
                      <strong>Transport</strong>
                      <span>{transportState.toUpperCase()}</span>
                    </div>
                    <div>
                      <strong>Session</strong>
                      <span>{sessionState.replaceAll('_', ' ').toUpperCase()}</span>
                    </div>
                    <div>
                      <strong>Reasoning</strong>
                      <span>{REASONING_LABELS[reasoningEffort]}</span>
                    </div>
                    <div>
                      <strong>Room Zoom</strong>
                      <span>{Math.round((roomZoom / 3.5) * 100)}%</span>
                    </div>
                  </div>
                  <p className="electron-window-message">{transportMessage}</p>
                  <p className="electron-window-message">Run: {formatRunId(activeRunId)}</p>
                </div>
              )}
              advancedContent={
                <div className="electron-advanced-grid">
                  <label className="council-field">
                    <span>Council WebSocket</span>
                    <input
                      value={form.wsUrl}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, wsUrl: event.target.value }))
                      }
                      placeholder="ws://127.0.0.1:8001/v1/council-room/ws"
                    />
                  </label>
                  <label className="council-field">
                    <span>Reasoning Mode</span>
                    <select
                      value={reasoningEffort}
                      onChange={(event) =>
                        setReasoningEffort(event.target.value as CouncilReasoningEffort)
                      }
                    >
                      <option value="none">Off</option>
                      <option value="low">Light</option>
                      <option value="medium">Balanced</option>
                      <option value="high">Deep</option>
                    </select>
                  </label>
                  <label className="council-field">
                    <span>Room Zoom</span>
                    <select
                      value={String(roomZoom)}
                      onChange={(event) => setRoomZoom(Number(event.target.value))}
                    >
                      {ROOM_ZOOM_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {Math.round((option / 3.5) * 100)}%
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="electron-env-note">
                    <strong>Token Source</strong>
                    <span>
                      {COUNCIL_TOKEN
                        ? 'Loaded from .env'
                        : 'No VITE_COUNCIL_TOKEN found. Add it to .env if your websocket requires auth.'}
                    </span>
                  </div>
                  <div className="electron-advanced-actions">
                    <button type="button" onClick={handleApplyConnection}>
                      Connect
                    </button>
                  </div>
                </div>
              }
            />
          </div>
        )
      case 'progress':
        return (
          <CouncilProgressPanel
            stageItems={stageItems}
            activeStage={activeStage}
            latestQuestion={latestQuestion}
            lastSummary={lastSummary}
            milestone={milestone}
            members={rosterEntries}
            sessionState={sessionState}
          />
        )
      case 'outcome':
        return (
          <CouncilOutcomePanel
            outcome={sessionOutcome}
            emptyText="Final synthesis, winning option, and references will appear here when the council finishes the mission."
            activeStage={activeStage}
            members={rosterEntries}
          />
        )
      case 'roster':
        return (
          <CouncilRosterPanel
            members={rosterEntries}
            selectedMemberId={selectedMemberId}
            onSelect={handleSelectMember}
          />
        )
      case 'log':
        return (
          <CouncilMissionLog
            entries={missionLogEntries}
            emptyText="Live stage and member events will appear here once a mission starts."
            activeStage={activeStage}
            members={rosterEntries}
          />
        )
      case 'ops':
        return (
          <section className="council-surface-panel electron-ops-panel">
            <div className="council-panel-heading">
              <span className="council-kicker">Ops Console</span>
              <h2>Terminal Activity</h2>
              <p>Keep runtime output available for debugging, but secondary to the council flow.</p>
            </div>
            <div className="electron-terminal-tabs">
              {terminalList.length === 0 ? <span className="electron-muted">No terminal output yet.</span> : null}
              {terminalList.map((terminal) => (
                <button
                  key={terminal.terminalId}
                  type="button"
                  className={activeTerminalId === terminal.terminalId ? 'is-active' : ''}
                  onClick={() => handleSelectTerminal(terminal.terminalId)}
                >
                  {terminal.label}
                </button>
              ))}
            </div>
            <pre className="electron-terminal-output">
              {activeTerminal?.output || 'Terminal output will appear here once the council starts a run.'}
            </pre>
          </section>
        )
      default:
        return null
    }
  }

  const visibleWindowIds = useMemo(
    () =>
      [...COUNCIL_WINDOW_IDS]
        .filter((windowId) => !windowLayout[windowId].hidden)
        .sort((left, right) => windowLayout[left].z - windowLayout[right].z),
    [windowLayout],
  )

  return (
    <div className="electron-council-desktop">
      <section className="electron-council-room">
        <PixelCouncilRoom
          connection={connection}
          title="CometRoom"
          subtitle="AI council arena"
          zoom={roomZoom}
          selectedMemberId={selectedMemberId}
          onMemberSelect={handleSelectMember}
          onMemberDoubleClick={openMemberDirectChat}
          showHeader={false}
          showSidebar={false}
        />
      </section>

      <div className="electron-room-badge">
        <strong>CometRoom</strong>
        <span>Drag glass windows around the room to monitor and control the council.</span>
      </div>

      <div className="electron-window-layer">
        {visibleWindowIds.map((windowId) => {
          const layout = windowLayout[windowId]
          return (
            <section
              key={windowId}
              className={`electron-liquid-window ${layout.minimized ? 'is-minimized' : ''}`}
              style={{
                left: `${layout.x}px`,
                top: `${layout.y}px`,
                width: `${layout.width}px`,
                zIndex: layout.z,
              }}
              onPointerDown={() => bringWindowToFront(windowId)}
            >
              <header
                className="electron-liquid-window-head"
                onPointerDown={(event) => handleWindowHeaderPointerDown(windowId, event)}
              >
                <div className="electron-liquid-window-grip">
                  <span className="electron-liquid-window-dot" />
                  <span>{COUNCIL_WINDOW_TITLES[windowId]}</span>
                </div>
                <div className="electron-liquid-window-actions">
                  <button
                    type="button"
                    className="electron-window-control"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => toggleWindowMinimized(windowId)}
                  >
                    {layout.minimized ? 'Expand' : 'Minimize'}
                  </button>
                  <button
                    type="button"
                    className="electron-window-control is-danger"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => hideWindow(windowId)}
                  >
                    Hide
                  </button>
                </div>
              </header>
              {!layout.minimized ? (
                <div className="electron-liquid-window-body">
                  {renderWindowContent(windowId)}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>

      {directChatMemberId ? (
        <div
          className="electron-dm-overlay"
          onClick={closeMemberDirectChat}
        >
          <section
            className="electron-dm-window"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="electron-dm-header">
              <div>
                <strong>
                  @{activeDirectChatMember?.displayName || directChatMemberId}
                </strong>
                <span>Direct council channel</span>
              </div>
              <button
                type="button"
                className="electron-dm-close"
                onClick={closeMemberDirectChat}
              >
                Close
              </button>
            </header>

            <div className="electron-dm-notice">
              Only this member keeps the private context from this conversation.
            </div>

            <div className="electron-dm-messages" ref={directChatScrollRef}>
              {activeDirectChatMessages.length === 0 ? (
                <div className="electron-dm-empty">
                  Start a private discussion to hear this member&apos;s perspective and influence their stance.
                </div>
              ) : null}
              {activeDirectChatMessages.map((message) => (
                <article
                  key={message.id}
                  className={`electron-dm-message is-${message.role}`}
                >
                  <p>{message.content}</p>
                  <time>{formatChatTimestamp(message.ts)}</time>
                </article>
              ))}
              {activeDirectChatPending ? (
                <article className="electron-dm-message is-assistant is-typing">
                  <p>Thinking...</p>
                </article>
              ) : null}
            </div>

            <form className="electron-dm-compose" onSubmit={handleSendDirectChatMessage}>
              <textarea
                value={directChatDraft}
                onChange={(event) => setDirectChatDraft(event.target.value)}
                placeholder="Message this member privately..."
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey) return
                  event.preventDefault()
                  if (!directChatDraft.trim()) return
                  sendDirectChatMessage()
                }}
              />
              <button
                type="submit"
                disabled={!directChatDraft.trim() || activeDirectChatPending}
              >
                Send
              </button>
            </form>
          </section>
        </div>
      ) : null}

      <footer className="electron-window-dock">
        <span className="electron-dock-label">Windows</span>
        {COUNCIL_WINDOW_IDS.map((windowId) => {
          const layout = windowLayout[windowId]
          const state = layout.hidden ? 'hidden' : layout.minimized ? 'minimized' : 'open'
          return (
            <button
              key={windowId}
              type="button"
              className={`electron-dock-button is-${state}`}
              onClick={() => openWindow(windowId)}
            >
              {COUNCIL_WINDOW_TITLES[windowId]}
            </button>
          )
        })}
        <button
          type="button"
          className="electron-dock-reset"
          onClick={resetWindowLayout}
        >
          Reset Layout
        </button>
      </footer>
    </div>
  )
}
