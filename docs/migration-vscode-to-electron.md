# Migration: VS Code Extension -> Electron/Embed

## Scope

Move from extension host behavior to either:

- standalone `apps/pixel-agents-electron`
- embedded React usage with `@pixel-agents/council-room` + `@pixel-agents/runtime-core`

## 1. Runtime Host Setup

Use `createRuntime({ hostAdapter })` and provide adapter operations:

- `spawnTerminal`
- `focusTerminal`
- `closeTerminal`
- `readLayout`
- `writeLayout`
- `subscribe`

For Electron use `createElectronHostAdapter()` in the renderer.

## 2. Council Orchestration Setup

Use `createCouncilBridge({ runtime, transport })` where transport is websocket/mock connector.

- Start stream: `bridge.connect()`
- Start run: `bridge.run(prompt, runId?)`
- Cancel run: `bridge.cancel(runId?)`

## 3. UI Setup

Two options:

- Keep legacy UI message path with `runtimeEventToUiMessages`
- Render council room directly with `PixelCouncilRoom`

## 4. Protocol Requirements

Your backend websocket should support:

- `run`
- optional `cancel`
- event metadata: `runId`, monotonic `sequence`

## 5. Cutover Checklist

- Electron parity checklist complete (`docs/parity-checklist.md`)
- CI gates pass
- Hackathon demo script is stable
- Team confirms VS Code adapter removal plan
