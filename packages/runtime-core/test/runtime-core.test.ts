import { describe, expect, it } from 'vitest'
import {
  createCouncilBridge,
  createRuntime,
  type CouncilBridgeTransport,
  type HostAdapter,
} from '../src/index.js'

function flushAsync(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe('runtime-core', () => {
  it('maps council lifecycle to runtime agent states', async () => {
    const hostAdapter: HostAdapter = {
      spawnTerminal: async ({ agentId }) => ({ terminalId: `term-${agentId}` }),
    }

    const runtime = createRuntime({ hostAdapter, autoSpawnTerminals: true })
    await runtime.start()

    await runtime.dispatchCouncilEvent({
      type: 'session.started',
      runId: 'run-1',
      members: [
        { id: 'chair', displayName: 'Chair', role: 'chairman' },
        { id: 'm1', displayName: 'M1', role: 'member' },
      ],
    })

    const created = runtime.listAgents()
    expect(created).toHaveLength(2)
    expect(created[0].terminalId).toBeTruthy()

    await runtime.dispatchCouncilEvent({
      type: 'member.started',
      runId: 'run-1',
      memberId: 'm1',
      activity: 'reviewing',
      detail: 'rank peers',
    })
    let updated = runtime.listAgents().find((entry) => entry.memberId === 'm1')
    expect(updated?.status).toBe('reviewing')
    expect(updated?.detail).toBe('rank peers')

    await runtime.dispatchCouncilEvent({
      type: 'member.waiting',
      runId: 'run-1',
      memberId: 'm1',
      reason: 'awaiting approval',
    })
    updated = runtime.listAgents().find((entry) => entry.memberId === 'm1')
    expect(updated?.status).toBe('waiting')

    await runtime.dispatchCouncilEvent({
      type: 'session.completed',
      runId: 'run-1',
      summary: 'done',
    })
    const finalized = runtime.listAgents()
    expect(finalized.every((entry) => entry.status === 'done')).toBe(true)

    await runtime.stop()
  })

  it('closes previous run agents when a new run starts', async () => {
    const closedTerminals: string[] = []
    const hostAdapter: HostAdapter = {
      spawnTerminal: async ({ agentId }) => ({ terminalId: `term-${agentId}` }),
      closeTerminal: async (terminalId) => {
        closedTerminals.push(terminalId)
      },
    }

    const runtime = createRuntime({ hostAdapter, autoSpawnTerminals: true })
    await runtime.start()

    await runtime.dispatchCouncilEvent({
      type: 'session.started',
      runId: 'run-1',
      members: [{ id: 'm1', displayName: 'M1' }],
    })
    expect(runtime.listAgents()).toHaveLength(1)

    await runtime.dispatchCouncilEvent({
      type: 'session.started',
      runId: 'run-2',
      members: [{ id: 'm2', displayName: 'M2' }],
    })

    const agents = runtime.listAgents()
    expect(agents).toHaveLength(1)
    expect(agents[0].memberId).toBe('m2')
    expect(closedTerminals).toContain('term-1')

    await runtime.stop()
  })

  it('bridges websocket council events with run and cancel semantics', async () => {
    const listeners = new Set<(event: unknown) => void>()
    const sentMessages: unknown[] = []

    const transport: CouncilBridgeTransport = {
      connect: () => {
        // no-op
      },
      disconnect: () => {
        // no-op
      },
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      send: (message) => {
        sentMessages.push(message)
      },
    }

    const runtime = createRuntime({ autoSpawnTerminals: false })
    await runtime.start()

    const bridge = createCouncilBridge({
      runtime,
      transport,
      createRunId: () => 'run-fixed',
      strictSequence: true,
    })

    const diagnostics: string[] = []
    const unsubscribe = bridge.subscribeDiagnostics((event) => {
      diagnostics.push(event.code)
    })

    bridge.connect()
    const runId = bridge.run('evaluate proposal')
    expect(runId).toBe('run-fixed')
    expect(sentMessages[0]).toEqual({
      type: 'run',
      runId: 'run-fixed',
      content: 'evaluate proposal',
    })

    for (const listener of listeners) {
      listener({
        type: 'session.started',
        runId: 'run-fixed',
        sequence: 1,
        members: [{ id: 'm1', displayName: 'Member 1' }],
      })
      listener({
        type: 'member.started',
        runId: 'run-fixed',
        sequence: 2,
        memberId: 'm1',
        activity: 'thinking',
      })
      listener({
        type: 'member.started',
        runId: 'run-fixed',
        sequence: 2,
        memberId: 'm1',
        activity: 'reviewing',
      })
      listener({
        type: 'member.started',
        runId: 'run-other',
        sequence: 3,
        memberId: 'm1',
        activity: 'synthesizing',
      })
      listener([
        {
          type: 'member.waiting',
          runId: 'run-fixed',
          sequence: 4,
          memberId: 'm1',
          reason: 'approval',
        },
      ])
    }

    await flushAsync()

    const [agent] = runtime.listAgents()
    expect(agent.memberId).toBe('m1')
    expect(agent.status).toBe('waiting')
    expect(diagnostics).toContain('event.out_of_order')
    expect(diagnostics).toContain('event.stale_run')

    bridge.cancel()
    expect(sentMessages[1]).toEqual({ type: 'cancel', runId: 'run-fixed' })

    unsubscribe()
    bridge.disconnect()
    await runtime.stop()
  })

  it('ignores protocol-only events without raising diagnostics', async () => {
    const listeners = new Set<(event: unknown) => void>()

    const transport: CouncilBridgeTransport = {
      connect: () => {
        // no-op
      },
      disconnect: () => {
        // no-op
      },
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      send: () => {
        // no-op
      },
    }

    const runtime = createRuntime({ autoSpawnTerminals: false })
    await runtime.start()

    const bridge = createCouncilBridge({
      runtime,
      transport,
      createRunId: () => 'run-protocol',
      strictSequence: true,
    })

    const diagnostics: string[] = []
    const unsubscribe = bridge.subscribeDiagnostics((event) => {
      diagnostics.push(event.code)
    })

    bridge.connect()
    bridge.run('protocol only events')

    for (const listener of listeners) {
      listener({ type: 'heartbeat', sequence: 1 })
      listener({
        type: 'session.started',
        runId: 'run-protocol',
        sequence: 2,
        members: [{ id: 'm1', displayName: 'Member 1' }],
      })
      listener({
        type: 'stage.started',
        runId: 'run-protocol',
        sequence: 3,
        stage: 'first_opinions',
      })
      listener({
        type: 'stage.completed',
        runId: 'run-protocol',
        sequence: 4,
        stage: 'first_opinions',
      })
    }

    await flushAsync()

    expect(runtime.listAgents()).toHaveLength(1)
    expect(diagnostics).toEqual([])

    unsubscribe()
    bridge.disconnect()
    await runtime.stop()
  })

  it('processes transport events sequentially when runtime setup is async', async () => {
    const listeners = new Set<(event: unknown) => void>()

    const transport: CouncilBridgeTransport = {
      connect: () => {
        // no-op
      },
      disconnect: () => {
        // no-op
      },
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      send: () => {
        // no-op
      },
    }

    const runtime = createRuntime({
      autoSpawnTerminals: true,
      hostAdapter: {
        spawnTerminal: async ({ agentId }) => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          return { terminalId: `term-${agentId}` }
        },
      },
    })
    await runtime.start()

    const bridge = createCouncilBridge({
      runtime,
      transport,
      createRunId: () => 'run-sequential',
      strictSequence: true,
    })

    bridge.connect()
    bridge.run('sequential replay')

    for (const listener of listeners) {
      listener({
        type: 'session.started',
        runId: 'run-sequential',
        sequence: 1,
        members: [{ id: 'm1', displayName: 'Member 1' }],
      })
      listener({
        type: 'member.started',
        runId: 'run-sequential',
        sequence: 2,
        memberId: 'm1',
        activity: 'thinking',
      })
      listener({
        type: 'session.completed',
        runId: 'run-sequential',
        sequence: 3,
        summary: 'done',
      })
    }

    await new Promise((resolve) => setTimeout(resolve, 30))

    const [agent] = runtime.listAgents()
    expect(agent.status).toBe('done')
    expect(agent.terminalId).toBeTruthy()

    bridge.disconnect()
    await runtime.stop()
  })
})
