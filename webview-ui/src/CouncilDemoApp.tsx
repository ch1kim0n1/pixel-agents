import {
  useEffect,
  useMemo,
  useRef,
  useState,
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
  type CouncilUxSessionState,
  type CouncilUxTransportState,
} from './lib/index.js'
import './council-demo.css'

interface DemoFormState {
  wsUrl: string
  prompt: string
  roomZoom: number
}

interface ActiveConnectionState {
  wsUrl: string
}

type DemoWindowId = 'mission' | 'progress' | 'outcome' | 'roster' | 'log'

interface DemoWindowLayout {
  x: number
  y: number
  width: number
  z: number
  hidden: boolean
  minimized: boolean
}

type DemoWindowLayoutMap = Record<DemoWindowId, DemoWindowLayout>

interface WindowDragState {
  windowId: DemoWindowId
  startX: number
  startY: number
  originX: number
  originY: number
}

const DEFAULT_PROMPT = 'Evaluate our hackathon pitch and propose execution priorities.'
const DEFAULT_WS_URL = (import.meta.env.VITE_COUNCIL_WS_URL || '').trim()
const COUNCIL_TOKEN = (import.meta.env.VITE_COUNCIL_TOKEN || '').trim()
const ROOM_ZOOM_OPTIONS = [2.5, 3, 3.5, 4, 4.5, 5] as const
const WINDOW_LAYOUT_STORAGE_KEY = 'cometroom-demo-floating-layout-v1'
const DEFAULT_ROOM_ZOOM = (() => {
  const parsed = Number(import.meta.env.VITE_COUNCIL_ROOM_ZOOM || 3.5)
  if (!Number.isFinite(parsed)) return 3.5
  return Math.max(2.5, Math.min(6, parsed))
})()

const DEMO_WINDOW_IDS: DemoWindowId[] = ['mission', 'progress', 'outcome', 'roster', 'log']

const DEMO_WINDOW_TITLES: Record<DemoWindowId, string> = {
  mission: 'Mission Control',
  progress: 'Quest Progress',
  outcome: 'Decision Deck',
  roster: 'Council Roster',
  log: 'Mission Log',
}

const WINDOW_DEFAULT_LAYOUT: DemoWindowLayoutMap = {
  mission: { x: 16, y: 16, width: 508, z: 20, hidden: false, minimized: false },
  progress: { x: 538, y: 16, width: 388, z: 21, hidden: false, minimized: false },
  outcome: { x: 538, y: 314, width: 404, z: 22, hidden: false, minimized: false },
  roster: { x: 16, y: 444, width: 388, z: 23, hidden: false, minimized: false },
  log: { x: 418, y: 444, width: 420, z: 24, hidden: false, minimized: false },
}

function readWebSocketUrl(): string {
  const params = new URLSearchParams(window.location.search)
  const candidate = params.get('councilWs')
  return candidate && candidate.trim() ? candidate.trim() : DEFAULT_WS_URL
}

function readPrompt(): string {
  const params = new URLSearchParams(window.location.search)
  const prompt = params.get('prompt')
  return prompt && prompt.trim() ? prompt.trim() : DEFAULT_PROMPT
}

function normalizeForm(form: DemoFormState): DemoFormState {
  return {
    wsUrl: form.wsUrl.trim(),
    prompt: form.prompt.trim(),
    roomZoom: Math.max(2.5, Math.min(6, form.roomZoom)),
  }
}

function toActiveConnection(form: DemoFormState): ActiveConnectionState {
  return {
    wsUrl: form.wsUrl.trim(),
  }
}

function createRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function formatRunId(runId: string | null): string {
  if (!runId) return 'No active run'
  if (runId.length <= 18) return runId
  return `${runId.slice(0, 8)}...${runId.slice(-6)}`
}

function buildConnection(
  active: ActiveConnectionState,
  onTransportError: (error: string) => void,
): CouncilEventConnection {
  if (!active.wsUrl) {
    return createMockCouncilConnection()
  }
  return connectCouncilRoomWebSocket({
    url: active.wsUrl,
    token: COUNCIL_TOKEN || undefined,
    onTransportError,
  })
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

function mapMembers(members: CouncilMemberDescriptor[]): CouncilRosterEntry[] {
  return members.map((member, index) => ({
    id: member.id,
    displayName: member.displayName,
    role: member.role === 'chairman' || (!member.role && index === 0) ? 'chairman' : 'member',
    status: 'idle',
    statusLabel: 'Idle',
    tone: 'neutral',
    personaName: member.personaName,
    personaSummary: member.personaSummary,
  }))
}

function updateMemberState(
  members: CouncilRosterEntry[],
  memberId: string,
  status: string,
  detail?: string,
): CouncilRosterEntry[] {
  return members.map((member) =>
    member.id === memberId
      ? {
          ...member,
          status,
          statusLabel: councilStatusLabel(status),
          tone: councilStatusTone(status),
          detail,
        }
      : member,
  )
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

function cloneWindowLayoutMap(layout: DemoWindowLayoutMap): DemoWindowLayoutMap {
  const next = {} as DemoWindowLayoutMap
  for (const windowId of DEMO_WINDOW_IDS) {
    next[windowId] = { ...layout[windowId] }
  }
  return next
}

function loadWindowLayoutMap(): DemoWindowLayoutMap {
  const defaults = cloneWindowLayoutMap(WINDOW_DEFAULT_LAYOUT)
  if (typeof window === 'undefined') return defaults

  try {
    const raw = window.localStorage.getItem(WINDOW_LAYOUT_STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<Record<DemoWindowId, Partial<DemoWindowLayout>>>

    for (const windowId of DEMO_WINDOW_IDS) {
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

export default function CouncilDemoApp() {
  const [form, setForm] = useState<DemoFormState>({
    wsUrl: readWebSocketUrl(),
    prompt: readPrompt(),
    roomZoom: DEFAULT_ROOM_ZOOM,
  })
  const [activeConnection, setActiveConnection] = useState<ActiveConnectionState>(
    toActiveConnection({
      wsUrl: readWebSocketUrl(),
      prompt: readPrompt(),
      roomZoom: DEFAULT_ROOM_ZOOM,
    }),
  )
  const [transportState, setTransportState] = useState<CouncilUxTransportState>(
    readWebSocketUrl() ? 'connecting' : 'mock',
  )
  const [transportMessage, setTransportMessage] = useState(
    readWebSocketUrl() ? 'Connecting...' : 'Demo council stream is ready.',
  )
  const [sessionState, setSessionState] = useState<CouncilUxSessionState>('idle')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [activeStage, setActiveStage] = useState<(typeof COUNCIL_STAGE_ORDER)[number] | null>(null)
  const [completedStages, setCompletedStages] = useState<Set<(typeof COUNCIL_STAGE_ORDER)[number]>>(
    () => new Set(),
  )
  const [sessionFeed, setSessionFeed] = useState<string[]>([])
  const [latestQuestion, setLatestQuestion] = useState<string | null>(null)
  const [lastSummary, setLastSummary] = useState<string | null>(null)
  const [sessionOutcome, setSessionOutcome] = useState<CouncilOutcomeSummary | null>(null)
  const [members, setMembers] = useState<CouncilRosterEntry[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [hadWaiting, setHadWaiting] = useState(false)
  const [hadError, setHadError] = useState(false)
  const [wasInterrupted, setWasInterrupted] = useState(false)
  const [windowLayout, setWindowLayout] = useState<DemoWindowLayoutMap>(() =>
    loadWindowLayoutMap(),
  )

  const dragStateRef = useRef<WindowDragState | null>(null)
  const zCounterRef = useRef<number>(40)

  const connection = useMemo(
    () =>
      buildConnection(activeConnection, (error) => {
        setTransportState('error')
        setTransportMessage(error)
      }),
    [activeConnection],
  )

  useEffect(() => {
    const maxZ = Object.values(windowLayout).reduce((highest, entry) => Math.max(highest, entry.z), 0)
    zCounterRef.current = Math.max(zCounterRef.current, maxZ)
  }, [windowLayout])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(WINDOW_LAYOUT_STORAGE_KEY, JSON.stringify(windowLayout))
    } catch {
      // Persistence is best effort only.
    }
  }, [windowLayout])

  useEffect(() => {
    const clampToViewport = () => {
      setWindowLayout((prev) => {
        let changed = false
        const next = cloneWindowLayoutMap(prev)

        for (const windowId of DEMO_WINDOW_IDS) {
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

  useEffect(() => {
    if (!activeConnection.wsUrl) {
      setTransportState('mock')
      setTransportMessage('Demo council stream is ready.')
      return
    }
    setTransportState('connecting')
    setTransportMessage(`Connecting to ${activeConnection.wsUrl}`)
  }, [activeConnection.wsUrl])

  useEffect(() => {
    const unsubscribe = connection.subscribe((event: CouncilEvent) => {
      if (event.type === 'heartbeat') {
        setTransportState((current) => (current === 'error' ? current : 'connected'))
        setTransportMessage(activeConnection.wsUrl ? 'Live council stream ready.' : 'Demo council stream ready.')
        return
      }

      if (event.type === 'session.started') {
        const nextMembers = mapMembers(event.members)
        setTransportState(activeConnection.wsUrl ? 'connected' : 'mock')
        setTransportMessage('Council session started.')
        setSessionState('running')
        setActiveRunId(event.runId ?? null)
        setActiveStage(null)
        setCompletedStages(new Set())
        setSessionFeed(['Council session started.'])
        setLatestQuestion(null)
        setLastSummary(null)
        setSessionOutcome(null)
        setMembers(nextMembers)
        setSelectedMemberId(
          nextMembers.find((member) => member.role === 'chairman')?.id
            ?? nextMembers[0]?.id
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
        setSessionFeed((prev) => [`${event.stage.replaceAll('_', ' ')} started.`, ...prev].slice(0, 12))
        return
      }

      if (event.type === 'stage.completed') {
        setCompletedStages((prev) => new Set([...prev, event.stage]))
        setActiveStage((current) => (current === event.stage ? null : current))
        setSessionFeed((prev) => [`${event.stage.replaceAll('_', ' ')} completed.`, ...prev].slice(0, 12))
        return
      }

      if (event.type === 'member.started') {
        const status = event.activity ?? 'thinking'
        setMembers((prev) => updateMemberState(prev, event.memberId, status, event.detail))
        setSessionFeed((prev) => [`${event.memberId} is ${status}.`, ...prev].slice(0, 12))
        return
      }

      if (event.type === 'member.completed') {
        setMembers((prev) => updateMemberState(prev, event.memberId, 'done', event.detail))
        setSessionFeed((prev) => [`${event.memberId} completed ${event.stage.replaceAll('_', ' ')}.`, ...prev].slice(0, 12))
        return
      }

      if (event.type === 'member.waiting') {
        const reason = event.reason?.trim() || `${event.memberId} needs clarification.`
        setMembers((prev) => updateMemberState(prev, event.memberId, 'waiting', reason))
        setSessionState('awaiting_input')
        setLatestQuestion(reason)
        setHadWaiting(true)
        setSessionFeed((prev) => [reason, ...prev].slice(0, 12))
        return
      }

      if (event.type === 'member.error') {
        setMembers((prev) => updateMemberState(prev, event.memberId, 'error', event.message))
        setHadError(true)
        setSessionFeed((prev) => [`${event.memberId} hit an error: ${event.message}`, ...prev].slice(0, 12))
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
        })
        setMembers((prev) => prev.map((member) => ({
          ...member,
          status: 'done',
          statusLabel: 'Done',
          tone: 'good',
          detail: undefined,
        })))
        setSessionFeed((prev) => [
          event.winningOption
            ? `Council session completed. Winner: ${event.winningOption.label} (${event.winningOption.title}).`
            : 'Council session completed.',
          ...prev,
        ].slice(0, 12))
        return
      }

      if (event.type === 'session.failed') {
        setWasInterrupted(true)
        setSessionState('failed')
        setActiveStage(null)
        setLatestQuestion(null)
        setSessionFeed((prev) => [`Run failed: ${event.message}`, ...prev].slice(0, 12))
      }
    })
    return () => unsubscribe()
  }, [activeConnection.wsUrl, connection])

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
  const canRun = (transportState === 'connected' || transportState === 'mock') && sessionState !== 'running'
  const canCancel = (transportState === 'connected' || transportState === 'mock') && sessionState === 'running'

  function handleApplyConnection(): void {
    const normalized = normalizeForm(form)
    setForm(normalized)
    setActiveConnection(toActiveConnection(normalized))
  }

  function handleStartRun(): void {
    const rawPrompt = form.prompt.trim()
    if (!rawPrompt) {
      setTransportMessage('Enter a mission prompt before starting the council.')
      return
    }
    if (!canRun) {
      setTransportMessage('Wait for the current run to finish or reconnect first.')
      return
    }
    const content =
      nextAction === 'clarify' || nextAction === 'rerun'
        ? composeFollowUpPrompt(rawPrompt, latestQuestion, lastSummary)
        : rawPrompt
    const runId = createRunId()
    connection.send({ type: 'run', runId, content })
    setActiveRunId(runId)
    setSessionState('running')
    setTransportMessage(`Run started (${runId}).`)
  }

  function handleCancelRun(): void {
    connection.send(
      activeRunId
        ? { type: 'cancel', runId: activeRunId }
        : { type: 'cancel' },
    )
    setWasInterrupted(true)
    setSessionState('failed')
    setTransportMessage('Cancellation requested.')
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

  function bringWindowToFront(windowId: DemoWindowId): void {
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

  function openWindow(windowId: DemoWindowId): void {
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

  function hideWindow(windowId: DemoWindowId): void {
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

  function toggleWindowMinimized(windowId: DemoWindowId): void {
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
    windowId: DemoWindowId,
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

  function renderWindowContent(windowId: DemoWindowId): ReactNode {
    switch (windowId) {
      case 'mission':
        return (
          <div className="cometroom-window-stack">
            <CouncilActionBanner
              copy={bannerCopy}
              onAction={bannerCopy.actionLabel ? handleBannerAction : undefined}
              actionDisabled={
                nextAction === 'connect'
                  ? transportState === 'connecting'
                  : nextAction === 'start_run' || nextAction === 'clarify' || nextAction === 'rerun'
                    ? !canRun
                    : false
              }
            />
            <CouncilLaunchCard
              title={nextAction === 'clarify' ? 'Clarify The Mission' : nextAction === 'rerun' ? 'Relaunch The Mission' : 'Launch A Council Run'}
              description="Start with one strong brief, then keep the same launcher for clarification and reruns."
              promptLabel="Mission Prompt"
              promptValue={form.prompt}
              onPromptChange={(value) => setForm((prev) => ({ ...prev, prompt: value }))}
              promptPlaceholder="Ask the council for a plan, critique, or decision."
              helperText="Include the objective, success criteria, and any hard constraints you want the council to respect."
              primaryAction={{
                label:
                  nextAction === 'clarify'
                    ? 'Clarify And Rerun'
                    : nextAction === 'rerun'
                      ? 'Retry Mission'
                      : 'Start Run',
                onClick: handleStartRun,
                disabled: !canRun,
              }}
              secondaryAction={{
                label: 'Cancel Run',
                onClick: handleCancelRun,
                disabled: !canCancel,
              }}
              topSlot={(
                <div className="cometroom-launch-status">
                  <div className="cometroom-launch-summary">
                    <div>
                      <strong>Transport</strong>
                      <span>{transportState.toUpperCase()}</span>
                    </div>
                    <div>
                      <strong>Session</strong>
                      <span>{sessionState.replaceAll('_', ' ').toUpperCase()}</span>
                    </div>
                    <div>
                      <strong>Run</strong>
                      <span>{formatRunId(activeRunId)}</span>
                    </div>
                    <div>
                      <strong>Room Zoom</strong>
                      <span>{Math.round((form.roomZoom / 3.5) * 100)}%</span>
                    </div>
                  </div>
                  <p className="cometroom-window-message">{transportMessage}</p>
                </div>
              )}
              advancedContent={
                <div className="cometroom-demo-advanced-grid">
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
                    <span>Room Zoom</span>
                    <select
                      value={String(form.roomZoom)}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, roomZoom: Number(event.target.value) }))
                      }
                    >
                      {ROOM_ZOOM_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {Math.round((option / 3.5) * 100)}%
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="cometroom-demo-envnote">
                    {COUNCIL_TOKEN
                      ? 'API token loaded from .env.'
                      : 'No VITE_COUNCIL_TOKEN found. Add it to .env if the council websocket requires auth.'}
                  </div>
                  <div className="cometroom-demo-advanced-actions">
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
          />
        )
      case 'outcome':
        return (
          <CouncilOutcomePanel
            outcome={sessionOutcome}
            emptyText="The final synthesis, winning option, and references will appear here after the council completes a run."
          />
        )
      case 'roster':
        return (
          <CouncilRosterPanel
            members={members}
            selectedMemberId={selectedMemberId}
            onSelect={setSelectedMemberId}
          />
        )
      case 'log':
        return (
          <CouncilMissionLog
            entries={missionLogEntries}
            emptyText="Recent council events will appear here as the mission unfolds."
          />
        )
      default:
        return null
    }
  }

  const visibleWindowIds = useMemo(
    () =>
      [...DEMO_WINDOW_IDS]
        .filter((windowId) => !windowLayout[windowId].hidden)
        .sort((left, right) => windowLayout[left].z - windowLayout[right].z),
    [windowLayout],
  )

  return (
    <div className="cometroom-desktop-root">
      <section className="cometroom-desktop-room">
        <PixelCouncilRoom
          connection={connection}
          title="CometRoom"
          subtitle="AI council arena"
          zoom={form.roomZoom}
          selectedMemberId={selectedMemberId}
          onMemberSelect={setSelectedMemberId}
          showHeader={false}
          showSidebar={false}
        />
      </section>

      <div className="cometroom-desktop-badge">
        <strong>CometRoom</strong>
        <span>Room-first layout active. Drag floating windows to monitor, guide, and configure council flow.</span>
      </div>

      <div className="cometroom-window-layer">
        {visibleWindowIds.map((windowId) => {
          const layout = windowLayout[windowId]
          return (
            <section
              key={windowId}
              className={`cometroom-liquid-window ${layout.minimized ? 'is-minimized' : ''}`}
              style={{
                left: `${layout.x}px`,
                top: `${layout.y}px`,
                width: `${layout.width}px`,
                zIndex: layout.z,
              }}
              onPointerDown={() => bringWindowToFront(windowId)}
            >
              <header
                className="cometroom-liquid-window-head"
                onPointerDown={(event) => handleWindowHeaderPointerDown(windowId, event)}
              >
                <div className="cometroom-liquid-window-grip">
                  <span className="cometroom-liquid-window-dot" />
                  <span>{DEMO_WINDOW_TITLES[windowId]}</span>
                </div>
                <div className="cometroom-liquid-window-actions">
                  <button
                    type="button"
                    className="cometroom-window-control"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => toggleWindowMinimized(windowId)}
                  >
                    {layout.minimized ? 'Expand' : 'Minimize'}
                  </button>
                  <button
                    type="button"
                    className="cometroom-window-control is-danger"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => hideWindow(windowId)}
                  >
                    Hide
                  </button>
                </div>
              </header>
              {!layout.minimized ? (
                <div className="cometroom-liquid-window-body">
                  {renderWindowContent(windowId)}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>

      <footer className="cometroom-window-dock">
        <span className="cometroom-dock-label">Windows</span>
        {DEMO_WINDOW_IDS.map((windowId) => {
          const layout = windowLayout[windowId]
          const state = layout.hidden ? 'hidden' : layout.minimized ? 'minimized' : 'open'
          return (
            <button
              key={windowId}
              type="button"
              className={`cometroom-dock-button is-${state}`}
              onClick={() => openWindow(windowId)}
            >
              {DEMO_WINDOW_TITLES[windowId]}
            </button>
          )
        })}
        <button
          type="button"
          className="cometroom-dock-reset"
          onClick={resetWindowLayout}
        >
          Reset Layout
        </button>
      </footer>
    </div>
  )
}
