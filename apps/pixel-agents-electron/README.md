# CometRoom (Electron)

Standalone Electron host for council-native Pixel Agents.

## Architecture

- `@pixel-agents/runtime-core`: runtime state machine
- `createCouncilBridge(...)`: council websocket -> runtime mapping with run/cancel semantics
- `@pixel-agents/council-room`: reusable council-room renderer
- Electron main host:
  - `node-pty` terminal sessions
  - `chokidar` transcript watchers
  - `electron-store` layout persistence

Transcript discovery watches both:

- `.claude/projects/<sha1(workspace-path)>/*.jsonl`
- legacy `.claude/projects/<sanitized-workspace-path>/*.jsonl`

## Development

From monorepo root:

```bash
npm run cometroom
```

Directly from this app:

```bash
npm run dev
```

Opt-in DevTools startup:

```bash
npm run dev:inspect
```

`npm run dev` no longer forces Chromium DevTools open on launch. This avoids the
known Electron DevTools `Autofill.enable` / `Autofill.setAddresses` protocol
warnings during normal development.

## Build

```bash
npm run build
npm run start
```

## UI Controls

- `Connect`: reconnect websocket with current URL/token values
- `Run Prompt` / `Start Run`: launch a run from the council prompt field
- `Cancel Run`: send cancel via `CouncilBridge.cancel(runId)`
- `Council Questions`: captures `member.waiting` reason and lets you submit a user answer as a **new run**
- `Runtime Agents`: focus/close agent terminals
- `Terminals`: per-agent output tabs
