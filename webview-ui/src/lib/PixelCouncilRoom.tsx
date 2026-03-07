import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { OfficeState } from '../office/engine/officeState.js'
import { startGameLoop } from '../office/engine/gameLoop.js'
import { renderFrame } from '../office/engine/renderer.js'
import { CharacterState, TILE_SIZE } from '../office/types.js'
import { createCouncilRoomLayout } from './council-layout.js'
import { preloadCouncilRoomAssets } from './council-room-assets.js'
import {
  COUNCIL_STAGE_ORDER,
  type CouncilActivity,
  type CouncilEvent,
  type CouncilEventConnection,
  type CouncilMemberDescriptor,
  type CouncilStage,
} from './council-events.js'
import './council-room.css'

type MemberVisualStatus =
  | 'idle'
  | 'thinking'
  | 'reviewing'
  | 'debating'
  | 'voting'
  | 'synthesizing'
  | 'waiting'
  | 'done'
  | 'error'

interface CouncilMemberRuntimeState {
  member: CouncilMemberDescriptor
  agentId: number
  seatId: string
  status: MemberVisualStatus
  detail?: string
}

interface CouncilScene {
  officeState: OfficeState
  members: CouncilMemberRuntimeState[]
  memberById: Map<string, CouncilMemberRuntimeState>
  agentToMemberId: Map<number, string>
}

export interface PixelCouncilRoomProps {
  connection: CouncilEventConnection
  initialMembers?: CouncilMemberDescriptor[]
  title?: string
  subtitle?: string
  assetBaseUrl?: string
  zoom?: number
  style?: CSSProperties
  className?: string
  selectedMemberId?: string | null
  onMemberSelect?: (memberId: string) => void
  onMemberDoubleClick?: (memberId: string) => void
  showHeader?: boolean
  showSidebar?: boolean
}

const DEFAULT_MEMBERS: CouncilMemberDescriptor[] = [
  { id: 'chairman', displayName: 'Lead Synth', role: 'chairman' },
  { id: 'member-a', displayName: 'Model A', role: 'member' },
  { id: 'member-b', displayName: 'Model B', role: 'member' },
  { id: 'member-c', displayName: 'Model C', role: 'member' },
  { id: 'member-d', displayName: 'Model D', role: 'member' },
  { id: 'member-e', displayName: 'Model E', role: 'member' },
  { id: 'member-f', displayName: 'Model F', role: 'member' },
]

const STAGE_LABELS: Record<CouncilStage, string> = {
  first_opinions: 'First Opinions',
  review: 'Review',
  debate: 'Debate',
  options: 'Options',
  vote: 'Vote',
  final_synthesis: 'Final Synthesis',
}

function ensureChairman(members: CouncilMemberDescriptor[]): CouncilMemberDescriptor[] {
  if (members.length === 0) return DEFAULT_MEMBERS
  const hasExplicitChairman = members.some((entry) => entry.role === 'chairman')
  const withNormalizedRoles = members.map((member, index) => ({
    ...member,
    role: (
      member.role === 'chairman'
        ? 'chairman'
        : index === 0 && !hasExplicitChairman
          ? 'chairman'
          : 'member'
    ) as 'member' | 'chairman',
  }))
  const chairman = withNormalizedRoles.find((member) => member.role === 'chairman')
  if (!chairman) {
    const [head, ...rest] = withNormalizedRoles
    return [{ ...head, role: 'chairman' }, ...rest]
  }
  return withNormalizedRoles
}

function buildScene(membersInput: CouncilMemberDescriptor[]): CouncilScene {
  const members = ensureChairman(membersInput)
  const layoutSpec = createCouncilRoomLayout()
  const officeState = new OfficeState(layoutSpec.layout)
  const chairman = members.find((member) => member.role === 'chairman') ?? members[0]
  const rest = members.filter((member) => member.id !== chairman.id)
  const orderedMembers = [chairman, ...rest]

  const memberById = new Map<string, CouncilMemberRuntimeState>()
  const agentToMemberId = new Map<number, string>()
  const runtimeMembers: CouncilMemberRuntimeState[] = []

  for (let index = 0; index < orderedMembers.length; index += 1) {
    const member = orderedMembers[index]
    const agentId = index + 1
    const seatId =
      member.role === 'chairman'
        ? layoutSpec.chairmanSeatId
        : layoutSpec.memberSeatIds[Math.max(0, index - 1)] ?? layoutSpec.memberSeatIds[layoutSpec.memberSeatIds.length - 1]
    const palette = index % 6
    const hueShift = index < 6 ? 0 : 45 + ((Math.floor(index / 6) * 60) % 240)

    officeState.addAgent(agentId, palette, hueShift, seatId, true)
    officeState.setAgentActive(agentId, true)
    officeState.setAgentTool(agentId, null)

    const runtime: CouncilMemberRuntimeState = {
      member,
      agentId,
      seatId,
      status: 'idle',
    }
    runtimeMembers.push(runtime)
    memberById.set(member.id, runtime)
    agentToMemberId.set(agentId, member.id)
  }

  return {
    officeState,
    members: runtimeMembers,
    memberById,
    agentToMemberId,
  }
}

function activityToStatus(activity?: CouncilActivity): MemberVisualStatus {
  if (activity === 'reviewing') return 'reviewing'
  if (activity === 'debating') return 'debating'
  if (activity === 'voting') return 'voting'
  if (activity === 'synthesizing') return 'synthesizing'
  return 'thinking'
}

function statusToToolName(status: MemberVisualStatus): string | null {
  switch (status) {
    case 'thinking':
      return 'Think'
    case 'reviewing':
      return 'Review'
    case 'debating':
      return 'Debate'
    case 'voting':
      return 'Vote'
    case 'synthesizing':
      return 'Synthesize'
    case 'error':
      return 'Error'
    default:
      return null
  }
}

function memberStatusColor(status: MemberVisualStatus): string {
  switch (status) {
    case 'thinking':
      return '#6fb6ff'
    case 'reviewing':
      return '#ffd76f'
    case 'debating':
      return '#ffb36b'
    case 'voting':
      return '#ff8de1'
    case 'synthesizing':
      return '#9cff9d'
    case 'waiting':
      return '#ff9f6b'
    case 'done':
      return '#9be8ff'
    case 'error':
      return '#ff7575'
    default:
      return '#9ba8bb'
  }
}

function statusLabel(status: MemberVisualStatus): string {
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

function excerptMemberDetail(detail?: string): string | null {
  if (!detail) return null
  const normalized = detail.replace(/\s+/g, ' ').trim()
  if (!normalized) return null

  const sentenceMatches = normalized.match(/[^.!?]+[.!?]*/g) ?? [normalized]
  const topSentences = sentenceMatches
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 3)

  if (topSentences.length === 0) return null
  const excerpt = topSentences.join(' ').trim()
  const bounded = excerpt.length > 260
    ? excerpt.slice(0, 257).trimEnd()
    : excerpt

  if (bounded.endsWith('...')) return bounded
  return `${bounded}...`
}

function withMemberStatus(
  members: CouncilMemberRuntimeState[],
  memberId: string,
  patch: Partial<Pick<CouncilMemberRuntimeState, 'status' | 'detail'>>,
): CouncilMemberRuntimeState[] {
  return members.map((entry) =>
    entry.member.id === memberId
      ? { ...entry, ...patch }
      : entry,
  )
}

function reapplyMemberState(
  scene: CouncilScene,
  previousMembers: CouncilMemberRuntimeState[],
): CouncilMemberRuntimeState[] {
  const previousById = new Map(previousMembers.map((entry) => [entry.member.id, entry]))
  const nextMembers: CouncilMemberRuntimeState[] = []

  for (const runtime of scene.members) {
    const previous = previousById.get(runtime.member.id)
    if (!previous) {
      nextMembers.push(runtime)
      continue
    }

    runtime.status = previous.status
    runtime.detail = previous.detail

    const office = scene.officeState
    office.setAgentActive(runtime.agentId, true)
    office.setAgentTool(runtime.agentId, statusToToolName(previous.status))
    office.clearPermissionBubble(runtime.agentId)
    if (previous.status === 'waiting') {
      office.showWaitingBubble(runtime.agentId)
    }
    if (previous.status === 'error') {
      office.showPermissionBubble(runtime.agentId)
    }

    nextMembers.push({
      ...runtime,
      status: previous.status,
      detail: previous.detail,
    })
  }

  return nextMembers
}

interface CouncilCanvasProps {
  officeState: OfficeState
  zoom: number
  onAgentClick: (agentId: number) => void
  onAgentDoubleClick: (agentId: number) => void
}

const DEFAULT_COUNCIL_CANVAS_ZOOM = 3.5

function CouncilRoomCanvas({
  officeState,
  zoom,
  onAgentClick,
  onAgentDoubleClick,
}: CouncilCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    const stop = startGameLoop(canvas, {
      update: (dt) => {
        officeState.update(dt)
      },
      render: (ctx) => {
        const rendered = renderFrame(
          ctx,
          canvas.width,
          canvas.height,
          officeState.tileMap,
          officeState.furniture,
          officeState.getCharacters(),
          zoom,
          0,
          0,
          {
            selectedAgentId: officeState.selectedAgentId,
            hoveredAgentId: officeState.hoveredAgentId,
            hoveredTile: officeState.hoveredTile,
            seats: officeState.seats,
            characters: officeState.characters,
          },
          undefined,
          officeState.getLayout().tileColors,
          officeState.getLayout().cols,
          officeState.getLayout().rows,
        )
        offsetRef.current = { x: rendered.offsetX, y: rendered.offsetY }
      },
    })

    return () => {
      stop()
      observer.disconnect()
    }
  }, [officeState, zoom])

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const localX = (clientX - rect.left) * dpr
      const localY = (clientY - rect.top) * dpr
      return {
        x: (localX - offsetRef.current.x) / zoom,
        y: (localY - offsetRef.current.y) / zoom,
      }
    },
    [zoom],
  )

  const handleClick = useCallback((event: React.MouseEvent) => {
    const world = screenToWorld(event.clientX, event.clientY)
    if (!world) return
    const hitId = officeState.getCharacterAt(world.x, world.y)
    if (hitId === null) return
    onAgentClick(hitId)
  }, [officeState, onAgentClick, screenToWorld])

  const handleDoubleClick = useCallback((event: React.MouseEvent) => {
    const world = screenToWorld(event.clientX, event.clientY)
    if (!world) return
    const hitId = officeState.getCharacterAt(world.x, world.y)
    if (hitId === null) return
    onAgentDoubleClick(hitId)
  }, [officeState, onAgentDoubleClick, screenToWorld])

  return (
    <div className="pixel-council-canvas" ref={containerRef}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  )
}

interface MemberLabelsOverlayProps {
  officeState: OfficeState
  members: CouncilMemberRuntimeState[]
  zoom: number
  selectedMemberId?: string | null
}

function MemberLabelsOverlay({
  officeState,
  members,
  zoom,
  selectedMemberId,
}: MemberLabelsOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const metricsRef = useRef({ width: 0, height: 0, dpr: 1 })
  const labelRefs = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateMetrics = () => {
      const rect = container.getBoundingClientRect()
      metricsRef.current = {
        width: rect.width,
        height: rect.height,
        dpr: window.devicePixelRatio || 1,
      }
    }

    updateMetrics()
    const observer = new ResizeObserver(updateMetrics)
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let raf = 0

    const updateLabelPositions = () => {
      const { width, height, dpr } = metricsRef.current
      if (width > 0 && height > 0) {
        const canvasWidth = Math.round(width * dpr)
        const canvasHeight = Math.round(height * dpr)
        const layout = officeState.getLayout()
        const mapWidth = layout.cols * TILE_SIZE * zoom
        const mapHeight = layout.rows * TILE_SIZE * zoom
        const offsetX = (canvasWidth - mapWidth) / 2
        const offsetY = (canvasHeight - mapHeight) / 2

        for (const runtime of members) {
          const labelNode = labelRefs.current.get(runtime.member.id)
          const character = officeState.characters.get(runtime.agentId)
          if (!labelNode || !character) continue
          const seatingOffset = character.state === CharacterState.TYPE ? 6 : 0
          labelNode.style.left = `${(offsetX + character.x * zoom) / dpr}px`
          labelNode.style.top = `${(offsetY + (character.y + seatingOffset - 22) * zoom) / dpr}px`
        }
      }

      raf = window.requestAnimationFrame(updateLabelPositions)
    }

    raf = window.requestAnimationFrame(updateLabelPositions)
    return () => window.cancelAnimationFrame(raf)
  }, [members, officeState, zoom])

  return (
    <div ref={containerRef} className="pixel-council-labels">
      {members.map((label) => {
        const speechExcerpt = excerptMemberDetail(label.detail)
        return (
          <div
            key={label.member.id}
            ref={(node) => {
              if (node) {
                labelRefs.current.set(label.member.id, node)
                return
              }
              labelRefs.current.delete(label.member.id)
            }}
            className={`pixel-council-label ${selectedMemberId === label.member.id ? 'is-selected' : ''}`}
          >
            {speechExcerpt ? (
              <div
                key={`${label.member.id}-${label.detail ?? ''}`}
                className="pixel-council-speech"
              >
                <span className="pixel-council-speech-text">
                  {speechExcerpt}
                </span>
              </div>
            ) : null}
            <span
              className="pixel-council-label-dot"
              style={{ background: memberStatusColor(label.status) }}
            />
            <span className="pixel-council-label-text">{label.member.displayName}</span>
          </div>
        )
      })}
    </div>
  )
}

export function PixelCouncilRoom({
  connection,
  initialMembers = DEFAULT_MEMBERS,
  title = 'CometRoom',
  subtitle = 'AI Agents that will think and give the best answer to the user',
  assetBaseUrl = '/assets',
  zoom = DEFAULT_COUNCIL_CANVAS_ZOOM,
  style,
  className,
  selectedMemberId = null,
  onMemberSelect,
  onMemberDoubleClick,
  showHeader = true,
  showSidebar = true,
}: PixelCouncilRoomProps) {
  const normalizedZoom = Number.isFinite(zoom)
    ? Math.max(2.5, Math.min(6, zoom))
    : DEFAULT_COUNCIL_CANVAS_ZOOM
  const initialSceneRef = useRef<CouncilScene | null>(null)
  if (!initialSceneRef.current) {
    initialSceneRef.current = buildScene(initialMembers)
  }

  const [scene, setScene] = useState<CouncilScene>(initialSceneRef.current)
  const [activeStage, setActiveStage] = useState<CouncilStage | null>(null)
  const [completedStages, setCompletedStages] = useState<Set<CouncilStage>>(() => new Set())
  const [members, setMembers] = useState<CouncilMemberRuntimeState[]>(initialSceneRef.current.members)
  const [eventLog, setEventLog] = useState<string[]>([])
  const sceneRef = useRef(scene)

  useEffect(() => {
    sceneRef.current = scene
  }, [scene])

  useEffect(() => {
    let cancelled = false

    preloadCouncilRoomAssets(assetBaseUrl)
      .then((result) => {
        if (cancelled || !result.customFurnitureApplied) return

        const currentScene = sceneRef.current
        const sessionMembers = currentScene.members.map((entry) => entry.member)
        const nextScene = buildScene(sessionMembers)
        nextScene.officeState.selectedAgentId = currentScene.officeState.selectedAgentId
        nextScene.officeState.cameraFollowId = currentScene.officeState.cameraFollowId

        const nextMembers = reapplyMemberState(nextScene, currentScene.members)
        sceneRef.current = nextScene
        setScene(nextScene)
        setMembers(nextMembers)
      })
      .catch(() => {
        // Asset loading falls back to built-in sprites on failure.
      })

    return () => {
      cancelled = true
    }
  }, [assetBaseUrl])

  const logEvent = useCallback((line: string) => {
    setEventLog((prev) => [line, ...prev].slice(0, 8))
  }, [])

  const updateMember = useCallback(
    (
      memberId: string,
      status: MemberVisualStatus,
      detail?: string,
    ) => {
      const runtime = sceneRef.current.memberById.get(memberId)
      if (!runtime) return
      runtime.status = status
      runtime.detail = detail

      const office = sceneRef.current.officeState
      office.setAgentActive(runtime.agentId, true)
      office.setAgentTool(runtime.agentId, statusToToolName(status))
      office.clearPermissionBubble(runtime.agentId)
      if (status === 'waiting') {
        office.showWaitingBubble(runtime.agentId)
      }
      if (status === 'error') {
        office.showPermissionBubble(runtime.agentId)
      }
      setMembers((prev) => withMemberStatus(prev, memberId, { status, detail }))
    },
    [],
  )

  const resetForSession = useCallback((sessionMembers: CouncilMemberDescriptor[]) => {
    const nextScene = buildScene(sessionMembers)
    sceneRef.current = nextScene
    setScene(nextScene)
    setMembers(nextScene.members)
    setActiveStage(null)
    setCompletedStages(new Set())
    setEventLog([])
  }, [])

  const handleEvent = useCallback((event: CouncilEvent) => {
    switch (event.type) {
      case 'session.started': {
        if (event.members.length > 0) {
          resetForSession(event.members)
        }
        logEvent('Session started')
        break
      }
      case 'stage.started': {
        setActiveStage(event.stage)
        logEvent(`${STAGE_LABELS[event.stage]} started`)
        break
      }
      case 'stage.completed': {
        setCompletedStages((prev) => new Set([...prev, event.stage]))
        setActiveStage((prev) => (prev === event.stage ? null : prev))
        logEvent(`${STAGE_LABELS[event.stage]} completed`)
        break
      }
      case 'member.started': {
        updateMember(
          event.memberId,
          activityToStatus(event.activity),
          event.detail,
        )
        break
      }
      case 'member.completed': {
        updateMember(event.memberId, 'done', event.detail)
        break
      }
      case 'member.waiting': {
        updateMember(event.memberId, 'waiting', event.reason)
        break
      }
      case 'member.error': {
        updateMember(event.memberId, 'error', event.message)
        break
      }
      case 'session.completed': {
        for (const runtime of sceneRef.current.members) {
          runtime.status = 'done'
          runtime.detail = undefined
          sceneRef.current.officeState.setAgentTool(runtime.agentId, null)
        }
        setActiveStage(null)
        setCompletedStages(new Set(COUNCIL_STAGE_ORDER))
        setMembers((prev) => prev.map((entry) => ({ ...entry, status: 'done' as const, detail: undefined })))
        logEvent('Session completed')
        break
      }
      case 'session.failed': {
        logEvent(`Session failed: ${event.message}`)
        break
      }
      case 'member.chat.message': {
        if (event.role === 'assistant') {
          logEvent(`${event.memberId} shared private input`)
        }
        break
      }
      case 'member.chat.error': {
        logEvent(`Private chat failed for ${event.memberId}: ${event.message}`)
        break
      }
      case 'heartbeat':
        break
      default:
        break
    }
  }, [logEvent, resetForSession, updateMember])

  useEffect(() => {
    const unsubscribe = connection.subscribe(handleEvent)
    connection.connect()
    return () => {
      unsubscribe()
      connection.disconnect()
    }
  }, [connection, handleEvent])

  const focusMember = useCallback((memberId: string) => {
    const current = sceneRef.current
    const target = current.memberById.get(memberId)
    if (!target) return
    current.officeState.selectedAgentId = target.agentId
    current.officeState.cameraFollowId = target.agentId
    onMemberSelect?.(memberId)
  }, [onMemberSelect])

  const handleAgentClick = useCallback((agentId: number) => {
    const current = sceneRef.current
    const memberId = current.agentToMemberId.get(agentId)
    if (!memberId) return
    focusMember(memberId)
  }, [focusMember])

  const walkChairmanToMember = useCallback((memberId: string) => {
    const current = sceneRef.current
    const office = current.officeState
    const targetMember = current.memberById.get(memberId)
    if (!targetMember) return

    const chairmanMember = current.members.find((entry) => entry.member.role === 'chairman')
      ?? current.members[0]
    if (!chairmanMember || chairmanMember.member.id === targetMember.member.id) return

    const targetCharacter = office.characters.get(targetMember.agentId)
    if (!targetCharacter) return

    const walkTargets = [
      { col: targetCharacter.tileCol - 1, row: targetCharacter.tileRow },
      { col: targetCharacter.tileCol + 1, row: targetCharacter.tileRow },
      { col: targetCharacter.tileCol, row: targetCharacter.tileRow - 1 },
      { col: targetCharacter.tileCol, row: targetCharacter.tileRow + 1 },
      { col: targetCharacter.tileCol - 2, row: targetCharacter.tileRow },
      { col: targetCharacter.tileCol + 2, row: targetCharacter.tileRow },
      { col: targetCharacter.tileCol, row: targetCharacter.tileRow - 2 },
      { col: targetCharacter.tileCol, row: targetCharacter.tileRow + 2 },
    ]

    for (const tile of walkTargets) {
      if (office.walkToTile(chairmanMember.agentId, tile.col, tile.row)) {
        return
      }
    }
  }, [])

  const handleAgentDoubleClick = useCallback((agentId: number) => {
    const current = sceneRef.current
    const memberId = current.agentToMemberId.get(agentId)
    if (!memberId) return
    focusMember(memberId)
    walkChairmanToMember(memberId)
    onMemberDoubleClick?.(memberId)
  }, [focusMember, onMemberDoubleClick, walkChairmanToMember])

  useEffect(() => {
    if (!selectedMemberId) return
    const target = sceneRef.current.memberById.get(selectedMemberId)
    if (!target) return
    sceneRef.current.officeState.selectedAgentId = target.agentId
    sceneRef.current.officeState.cameraFollowId = target.agentId
  }, [scene, selectedMemberId])

  const stageTimeline = (
    <>
      {COUNCIL_STAGE_ORDER.map((stage) => {
        const isActive = activeStage === stage
        const isDone = completedStages.has(stage)
        return (
          <div
            key={stage}
            className={`pixel-council-stage ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}`}
          >
            {STAGE_LABELS[stage]}
          </div>
        )
      })}
    </>
  )

  return (
    <div className={`pixel-council-root ${className ?? ''}`} style={style}>
      <div className={`pixel-council-shell ${showHeader ? '' : 'is-headerless'} ${showSidebar ? '' : 'is-sidebarless'}`}>
        {showHeader ? (
          <div className="pixel-council-head">
            <div>
              <h1 className="pixel-council-title">{title}</h1>
              <p className="pixel-council-subtitle">{subtitle}</p>
            </div>
            <div className="pixel-council-timeline">
              {stageTimeline}
            </div>
          </div>
        ) : null}

        <div className="pixel-council-main">
          <div className="pixel-council-room-wrap">
            {!showHeader ? (
              <div className="pixel-council-stage-ribbon">
                {stageTimeline}
              </div>
            ) : null}
            <CouncilRoomCanvas
              officeState={scene.officeState}
              zoom={normalizedZoom}
              onAgentClick={handleAgentClick}
              onAgentDoubleClick={handleAgentDoubleClick}
            />
            <MemberLabelsOverlay
              officeState={scene.officeState}
              members={members}
              zoom={normalizedZoom}
              selectedMemberId={selectedMemberId}
            />
          </div>

          {showSidebar ? (
            <aside className="pixel-council-sidebar">
              <section className="pixel-council-panel">
                <h2>Members</h2>
                <div className="pixel-council-member-list">
                  {members.map((entry) => (
                    <button
                      key={entry.member.id}
                      type="button"
                      className={`pixel-council-member-row ${selectedMemberId === entry.member.id ? 'is-selected' : ''}`}
                      onClick={() => focusMember(entry.member.id)}
                    >
                      <span
                        className="pixel-council-member-dot"
                        style={{ background: memberStatusColor(entry.status) }}
                      />
                      <div className="pixel-council-member-copy">
                        <div className="pixel-council-member-name">
                          {entry.member.displayName}
                          {entry.member.role === 'chairman' ? ' (Lead Synth)' : ''}
                        </div>
                        <div className="pixel-council-member-status">
                          {statusLabel(entry.status)}
                          {entry.detail ? `: ${entry.detail}` : ''}
                        </div>
                        {entry.member.personaName ? (
                          <div className="pixel-council-member-persona">
                            {entry.member.personaName}
                            {entry.member.personaSummary ? ` - ${entry.member.personaSummary}` : ''}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="pixel-council-panel">
                <h2>Feed</h2>
                <ul className="pixel-council-log">
                  {eventLog.length === 0 ? <li>Waiting for council events...</li> : null}
                  {eventLog.map((line, index) => (
                    <li key={`${line}-${index}`}>{line}</li>
                  ))}
                </ul>
              </section>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  )
}
