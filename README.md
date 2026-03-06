# Pixel Agents

Council-native Pixel Agents monorepo for hackathon delivery.

Current primary product surface:

- **CometRoom**: executive war-room council UI with Pixel Agents + runtime panel.

This repo now ships three production surfaces:

- `@pixel-agents/runtime-core`: host-agnostic runtime (agent lifecycle, council-to-agent state mapping, persistence hooks)
- `@pixel-agents/council-room`: reusable React council-room renderer + websocket connector + runtime UI adapter
- `apps/pixel-agents-electron`: standalone Electron host with terminal + transcript integration

The VS Code extension code under `src/` is treated as a legacy adapter until parity signoff is complete.

## Requirements

- Node `>=22.12.0`
- npm `>=10.9.0`
- Claude CLI on the host machine when using terminal spawning

## Quick Start

```bash
git clone https://github.com/pablodelucca/pixel-agents.git
cd pixel-agents
npm run bootstrap
npm run ci
```

Run CometRoom (one command):

```bash
npm run cometroom
```

This script processes dropped assets and launches the Electron host.

Inside CometRoom, use the `Reasoning Mode` control before `Start Run` to choose
how deeply the council should deliberate for that run:

- `Off`
- `Light`
- `Balanced`
- `Deep`

This forwards the selected setting to the council backend as a per-run override.
It does not render or store raw chain-of-thought.

Run the deterministic cross-repo scenario check:

```bash
npm run scenario:check
```

This starts a local `hackai26-pre-code` council-room backend with deterministic
stage outputs, captures a live websocket run, and replays the emitted events
through `@pixel-agents/runtime-core` so you can verify the integration contract
without depending on external model providers.

Fast path when assets are already processed:

```bash
npm run dev:electron
```

Build council-room library bundle:

```bash
npm run build:council-room
```

Process dropped art packs into council/electron runtime assets:

```bash
python scripts/process-dropped-council-assets.py
```

The processor ingests direct PNG furniture and auto-slices `*-Sheet.png` interior packs into individual furniture assets.
It also syncs the pixel UI font to both runtime asset roots.

## Workspace Layout

```text
packages/
  host-bridge/      # VS Code/Electron/browser host message bridge
  runtime-core/     # RuntimeCore + CouncilBridge contracts
webview-ui/         # @pixel-agents/council-room library + demo UI
apps/
  pixel-agents-electron/  # Standalone Electron host adapter
src/                # Legacy VS Code adapter (decommission target)
```

Processed council assets are synced to:

- `webview-ui/public/assets`
- `apps/pixel-agents-electron/public/assets`

## Public Contracts

- `HostAdapter`: terminal create/focus/close, layout persistence, host event subscription, optional external open
- `RuntimeCore`: `createRuntime`, `start`, `stop`, `dispatchHostEvent`, `dispatchCouncilEvent`, `subscribeRuntimeEvents`
- `CouncilBridge`: `connect`, `disconnect`, `run(prompt, runId?, options?)`, `cancel(runId?)`, diagnostics subscription
- Electron preload API:
  - `window.pixelAgentsHost.postMessage(message)`
  - `window.pixelAgentsHost.onMessage(listener)`

## Council WebSocket Compatibility

Default stream target:

```text
ws://localhost:8001/v1/council-room/ws
```

Backwards compatibility guarantees in the companion API (`hackai26-pre-code`):

- Existing `run` messages remain valid
- Optional `cancel` message is supported
- Optional `reasoningEffort` is supported on `run`
- Emitted events include optional `runId` and monotonic `sequence`

## Quality Gates

`npm run ci` executes workspace gates:

1. `typecheck`
2. `lint`
3. `test`
4. `build`

GitHub Actions workflow: `.github/workflows/ci.yml`.

## Parity and Decommission

- Baseline parity checklist: [`docs/parity-checklist.md`](docs/parity-checklist.md)
- Migration guide: [`docs/migration-vscode-to-electron.md`](docs/migration-vscode-to-electron.md)

Decommission policy is `parity then remove`: VS Code adapter is removed only after parity checklist is signed off for Electron + embedded library usage.

## Security

- Do not commit API keys.
- Inject secrets through environment variables in local/dev/CI.
