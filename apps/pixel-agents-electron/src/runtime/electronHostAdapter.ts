import type {
  HostAdapter,
  HostAdapterEvent,
  SpawnTerminalInput,
  SpawnTerminalResult,
} from '@pixel-agents/runtime-core'

interface HostRequest {
  type: string
  requestId: string
  [key: string]: unknown
}

interface HostRequestPayload {
  type: string
  [key: string]: unknown
}

interface HostResponse {
  type: string
  requestId?: string
  ok?: boolean
  error?: string
  [key: string]: unknown
}

interface PendingRequest {
  resolve: (value: HostResponse) => void
  reject: (reason: Error) => void
}

export interface ElectronHostAdapter extends HostAdapter {
  dispose: () => void
}

function createRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createElectronHostAdapter(): ElectronHostAdapter {
  const listeners = new Set<(event: HostAdapterEvent) => void>()
  const pending = new Map<string, PendingRequest>()
  const hostApi = window.pixelAgentsHost
  const unsubscribe =
    typeof hostApi?.onMessage === 'function'
      ? hostApi.onMessage((raw: unknown) => {
          const message = (raw ?? {}) as HostResponse
          if (typeof message.requestId === 'string' && pending.has(message.requestId)) {
            const entry = pending.get(message.requestId)
            pending.delete(message.requestId)
            if (!entry) return
            if (message.ok === false) {
              entry.reject(new Error(message.error || 'Host request failed'))
            } else {
              entry.resolve(message)
            }
            return
          }
          if (typeof message.type === 'string') {
            for (const listener of listeners) {
              listener(message as HostAdapterEvent)
            }
          }
        })
      : undefined

  async function sendRequest(payload: HostRequestPayload): Promise<HostResponse> {
    if (!hostApi?.postMessage) {
      throw new Error('Electron host bridge is unavailable.')
    }
    const requestId = createRequestId()
    const request: HostRequest = { ...payload, requestId }
    const responsePromise = new Promise<HostResponse>((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      window.setTimeout(() => {
        const entry = pending.get(requestId)
        if (!entry) return
        pending.delete(requestId)
        entry.reject(new Error(`Host request timed out: ${payload.type}`))
      }, 15_000)
    })
    hostApi.postMessage(request)
    return responsePromise
  }

  return {
    subscribe: (listener: (event: HostAdapterEvent) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    spawnTerminal: async (input: SpawnTerminalInput): Promise<SpawnTerminalResult> => {
      const response = await sendRequest({
        type: 'host.spawnTerminal',
        agentId: input.agentId,
        memberId: input.memberId,
        displayName: input.displayName,
        role: input.role,
        cwd: input.cwd,
      })
      const terminalId = typeof response.terminalId === 'string' ? response.terminalId : ''
      if (!terminalId) throw new Error('Host did not return terminalId.')
      return { terminalId }
    },
    focusTerminal: async (terminalId: string): Promise<void> => {
      await sendRequest({ type: 'host.focusTerminal', terminalId })
    },
    closeTerminal: async (terminalId: string): Promise<void> => {
      await sendRequest({ type: 'host.closeTerminal', terminalId })
    },
    readLayout: async () => {
      const response = await sendRequest({ type: 'host.readLayout' })
      const layout =
        response.layout && typeof response.layout === 'object'
          ? (response.layout as Record<string, unknown>)
          : null
      return layout
    },
    writeLayout: async (layout: Record<string, unknown>) => {
      await sendRequest({ type: 'host.writeLayout', layout })
    },
    openExternal: async (url: string) => {
      await sendRequest({ type: 'openExternal', url })
    },
    stop: async () => {
      for (const [, entry] of pending) {
        entry.reject(new Error('Host adapter is stopping.'))
      }
      pending.clear()
    },
    dispose: () => {
      if (typeof unsubscribe === 'function') unsubscribe()
      for (const [, entry] of pending) {
        entry.reject(new Error('Host adapter disposed.'))
      }
      pending.clear()
      listeners.clear()
    },
  }
}
