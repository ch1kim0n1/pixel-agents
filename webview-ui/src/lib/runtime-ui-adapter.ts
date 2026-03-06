import type { RuntimeAgentStatus, RuntimeEvent } from '@pixel-agents/runtime-core'

export interface RuntimeUiMessage {
  type: string
  [key: string]: unknown
}

function runtimeStatusToLegacyStatus(status: RuntimeAgentStatus): string {
  if (status === 'idle') return 'active'
  if (
    status === 'thinking'
    || status === 'reviewing'
    || status === 'debating'
    || status === 'voting'
    || status === 'synthesizing'
  ) return 'active'
  if (status === 'waiting') return 'waiting'
  if (status === 'done') return 'done'
  return 'error'
}

export function runtimeEventToUiMessages(event: RuntimeEvent): RuntimeUiMessage[] {
  if (event.type === 'runtime.agent.created') {
    return [{ type: 'agentCreated', id: event.agent.agentId }]
  }

  if (event.type === 'runtime.agent.updated') {
    return [
      {
        type: 'agentStatus',
        id: event.agent.agentId,
        status: runtimeStatusToLegacyStatus(event.agent.status),
        detail: event.agent.detail,
      },
    ]
  }

  if (event.type === 'runtime.agent.closed') {
    return [{ type: 'agentClosed', id: event.agentId }]
  }

  if (event.type === 'runtime.layout.loaded') {
    return [{ type: 'layoutLoaded', layout: event.layout }]
  }

  if (event.type === 'runtime.layout.saved') {
    return [{ type: 'layoutLoaded', layout: event.layout }]
  }

  if (event.type === 'runtime.host.event') {
    if (typeof event.event.type === 'string') {
      return [event.event as RuntimeUiMessage]
    }
  }

  return []
}
