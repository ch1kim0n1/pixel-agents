import type { CouncilEvent, CouncilEventConnection } from '../council-events.js'
import { parseCouncilEvent, parseLegacyCouncilEvent } from '../council-events.js'

export interface CouncilWebSocketConnectionOptions {
  url: string
  token?: string
  runId?: string
  sessionId?: string
  protocols?: string | string[]
  runOnConnectContent?: string
  autoReconnect?: boolean
  reconnectDelayMs?: number
  maxReconnectDelayMs?: number
  onTransportError?: (error: string) => void
}

function parseMessagePayload(data: unknown): unknown {
  if (typeof data !== 'string') return data
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

function emitParsedEvent(
  payload: unknown,
  emit: (event: CouncilEvent) => void,
): boolean {
  const parsed = parseCouncilEvent(payload) ?? parseLegacyCouncilEvent(payload)
  if (parsed) {
    emit(parsed)
    return true
  }

  if (Array.isArray(payload)) {
    let emitted = false
    for (const item of payload) {
      emitted = emitParsedEvent(item, emit) || emitted
    }
    return emitted
  }

  return false
}

export function connectCouncilRoomWebSocket(
  options: CouncilWebSocketConnectionOptions,
): CouncilEventConnection {
  const listeners = new Set<(event: CouncilEvent) => void>()
  const autoReconnect = options.autoReconnect !== false
  const reconnectDelayMs = Math.max(250, options.reconnectDelayMs ?? 1000)
  const maxReconnectDelayMs = Math.max(
    reconnectDelayMs,
    options.maxReconnectDelayMs ?? 10_000,
  )

  let socket: WebSocket | null = null
  let reconnectTimer: number | null = null
  let reconnectAttempt = 0
  let manuallyClosed = false
  let initialRunQueued = false
  const outboundQueue: unknown[] = []

  function emit(event: CouncilEvent): void {
    for (const listener of listeners) {
      listener(event)
    }
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer === null) return
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  function buildUrl(): string {
    const built = new URL(options.url, window.location.href)
    if (options.token) built.searchParams.set('token', options.token)
    if (options.sessionId) built.searchParams.set('session_id', options.sessionId)
    return built.toString()
  }

  function scheduleReconnect(): void {
    if (!autoReconnect || manuallyClosed) return
    if (reconnectTimer !== null) return
    const delay = Math.min(
      maxReconnectDelayMs,
      reconnectDelayMs * (2 ** reconnectAttempt),
    )
    reconnectAttempt += 1
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function connect(): void {
    manuallyClosed = false
    if (socket && socket.readyState <= WebSocket.OPEN) return
    clearReconnectTimer()

    try {
      socket = new WebSocket(buildUrl(), options.protocols)
    } catch (error) {
      options.onTransportError?.(
        error instanceof Error ? error.message : 'Failed to open websocket.',
      )
      scheduleReconnect()
      return
    }

    socket.onopen = () => {
      reconnectAttempt = 0
      emit({ type: 'heartbeat', ts: new Date().toISOString() })
      if (options.runOnConnectContent && !initialRunQueued) {
        outboundQueue.push({
          type: 'run',
          runId: options.runId,
          content: options.runOnConnectContent,
        })
        initialRunQueued = true
      }
      while (outboundQueue.length > 0 && socket?.readyState === WebSocket.OPEN) {
        const next = outboundQueue.shift()
        if (next === undefined) continue
        socket.send(JSON.stringify(next))
      }
    }

    socket.onmessage = (message) => {
      const payload = parseMessagePayload(message.data)
      if (payload === null) return
      emitParsedEvent(payload, emit)
    }

    socket.onerror = () => {
      options.onTransportError?.('Council websocket encountered a transport error.')
    }

    socket.onclose = () => {
      socket = null
      scheduleReconnect()
    }
  }

  function disconnect(): void {
    manuallyClosed = true
    clearReconnectTimer()
    if (socket) {
      socket.close()
      socket = null
    }
  }

  function subscribe(listener: (event: CouncilEvent) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function send(message: unknown): void {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message))
      return
    }
    outboundQueue.push(message)
  }

  return { connect, disconnect, subscribe, send }
}
