import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createCouncilBridge, createRuntime } from '../packages/runtime-core/dist/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pixelAgentsRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(pixelAgentsRoot, '..')
const helperScript = path.resolve(__dirname, 'council_scenario.py')
const pythonCommand = process.env.PIXEL_AGENTS_SCENARIO_PYTHON || 'py'
const pythonPrefixArgs = process.env.PIXEL_AGENTS_SCENARIO_PYTHON
  ? []
  : ['-3.12']

const host = '127.0.0.1'
const port = Number(process.env.PIXEL_AGENTS_SCENARIO_PORT || 0) || (8300 + Math.floor(Math.random() * 500))
const token = 'scenario-token'
const runId = 'scenario-run'
const reasoningEffort = 'high'
const wsUrl = `ws://${host}:${port}/v1/council-room/ws`
const httpUrl = `http://${host}:${port}/`
const prompt =
  process.argv.slice(2).join(' ').trim()
  || 'Evaluate this hackathon app and decide the top three execution priorities for demo readiness.'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function collectProcessOutput(child) {
  let stdout = ''
  let stderr = ''

  child.stdout?.on('data', (chunk) => {
    stdout += chunk.toString()
  })
  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString()
  })

  return {
    getStdout: () => stdout,
    getStderr: () => stderr,
  }
}

function spawnProcess(command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const output = collectProcessOutput(child)
  return { child, output }
}

async function runProcess(command, args, cwd) {
  const { child, output } = spawnProcess(command, args, cwd)
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 0))
  })
  if (exitCode !== 0) {
    throw new Error(
      `Command failed (${exitCode}): ${command} ${args.join(' ')}\n${output.getStderr() || output.getStdout()}`,
    )
  }
  return output.getStdout().trim()
}

async function waitForServer(url, timeoutMs = 15_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = httpRequest(url, (response) => {
          response.resume()
          if (response.statusCode && response.statusCode < 500) {
            resolve()
            return
          }
          reject(new Error(`Unexpected status: ${response.statusCode}`))
        })
        req.once('error', reject)
        req.end()
      })
      return
    } catch {
      await sleep(250)
    }
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function summarizeEvents(events) {
  const counts = new Map()
  for (const event of events) {
    const type = typeof event?.type === 'string' ? event.type : 'unknown'
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

async function runScenarioReplay(events) {
  const listeners = new Set()
  const sentMessages = []
  const spawnCalls = []
  const focusCalls = []
  const closeCalls = []

  const transport = {
    connect() {
      // no-op
    },
    disconnect() {
      // no-op
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    send(message) {
      sentMessages.push(message)
    },
  }

  const runtime = createRuntime({
    autoSpawnTerminals: true,
    hostAdapter: {
      async spawnTerminal(input) {
        const terminalId = `term-${input.memberId}`
        spawnCalls.push({ ...input, terminalId })
        return { terminalId }
      },
      async focusTerminal(terminalId) {
        focusCalls.push(terminalId)
      },
      async closeTerminal(terminalId) {
        closeCalls.push(terminalId)
      },
    },
  })

  await runtime.start()

  const bridge = createCouncilBridge({
    runtime,
    transport,
    createRunId: () => runId,
    strictSequence: true,
  })

  const diagnostics = []
  const unsubscribeDiagnostics = bridge.subscribeDiagnostics((event) => {
    diagnostics.push(event)
  })

  bridge.connect()
  const emittedRunId = bridge.run(prompt, undefined, { reasoningEffort })
  assert.equal(emittedRunId, runId)
  assert.deepEqual(sentMessages[0], { type: 'run', runId, content: prompt, reasoningEffort })

  for (const event of events) {
    for (const listener of listeners) {
      listener(event)
    }
  }

  await sleep(75)

  const agents = runtime.listAgents()
  assert.equal(agents.length, 7, `Expected 7 runtime agents, got ${agents.length}`)
  assert.equal(spawnCalls.length, 7, `Expected 7 spawned terminals, got ${spawnCalls.length}`)
  assert.equal(diagnostics.length, 0, `Expected no bridge diagnostics, got ${JSON.stringify(diagnostics)}`)
  assert.ok(agents.every((agent) => agent.status === 'done'), 'Expected all agents to finish in done state')
  assert.ok(agents.every((agent) => agent.terminalId), 'Expected every agent to keep a terminal mapping')
  assert.ok(agents.some((agent) => agent.role === 'chairman'), 'Expected one chairman agent in runtime state')

  unsubscribeDiagnostics()
  bridge.disconnect()
  await runtime.stop()

  return {
    agents,
    spawnCalls,
    focusCalls,
    closeCalls,
    sentMessages,
  }
}

async function main() {
  const server = spawnProcess(
    pythonCommand,
    [...pythonPrefixArgs, helperScript, 'serve', '--host', host, '--port', String(port), '--token', token],
    pixelAgentsRoot,
  )

  try {
    await waitForServer(httpUrl)

    const rawCapture = await runProcess(
      pythonCommand,
      [
        ...pythonPrefixArgs,
        helperScript,
        'capture',
        '--url',
        wsUrl,
        '--token',
        token,
        '--prompt',
        prompt,
        '--run-id',
        runId,
        '--reasoning-effort',
        reasoningEffort,
      ],
      pixelAgentsRoot,
    )

    const capture = JSON.parse(rawCapture)
    assert.equal(capture.heartbeat?.type, 'heartbeat', 'Expected websocket heartbeat before scenario run')
    assert.ok(Array.isArray(capture.events), 'Expected event array from capture helper')
    assert.ok(capture.events.length > 0, 'Expected captured council events')

    const lastEvent = capture.events[capture.events.length - 1]
    assert.equal(lastEvent?.type, 'session.completed', 'Expected scenario to end with session.completed')
    assert.ok(!capture.events.some((event) => event?.type === 'session.failed'), 'Scenario emitted session.failed')
    assert.ok(!capture.events.some((event) => event?.type === 'member.error'), 'Scenario emitted member.error')
    assert.equal(
      capture.events[0]?.reasoningEffort,
      reasoningEffort,
      'Expected session.started to expose the requested reasoning effort',
    )

    const counts = summarizeEvents(capture.events)
    assert.equal(counts['stage.started'], 6, 'Expected six stage.started events')
    assert.equal(counts['stage.completed'], 6, 'Expected six stage.completed events')
    assert.equal(counts['member.started'], 30, 'Expected thirty member.started events')
    assert.equal(counts['member.completed'], 30, 'Expected thirty member.completed events')
    assert.equal(lastEvent?.winningOption?.label, 'Option A', 'Expected Option A to win the scenario vote')
    assert.equal(lastEvent?.references?.length, 2, 'Expected two scenario references')
    assert.equal(lastEvent?.options?.length, 3, 'Expected three answer choices')

    const replay = await runScenarioReplay(capture.events)

    console.log(
      JSON.stringify(
        {
          ok: true,
          websocket: {
            url: wsUrl,
            runId,
            reasoningEffort,
            counts,
            summary: lastEvent.summary,
          },
          runtime: {
            agentCount: replay.agents.length,
            statuses: replay.agents.map((agent) => ({
              memberId: agent.memberId,
              role: agent.role,
              status: agent.status,
              terminalId: agent.terminalId,
            })),
            sentMessages: replay.sentMessages,
          },
        },
        null,
        2,
      ),
    )
  } finally {
    server.child.kill()
    await new Promise((resolve) => {
      server.child.once('exit', () => resolve())
      setTimeout(() => resolve(), 2_000)
    })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
