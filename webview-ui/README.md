# @pixel-agents/council-room

Reusable React council-room package for Pixel Agents hosts.

Default renderer branding:

- `CometRoom`
- `AI Agents that will think and give the best answer to the user`

## Exports

- `PixelCouncilRoom`
- `preloadCouncilRoomAssets`
- `connectCouncilRoomWebSocket`
- `createMockCouncilConnection`
- `parseCouncilEvent` / `parseLegacyCouncilEvent`
- `runtimeEventToUiMessages`

## Install (workspace)

From monorepo root:

```bash
npm run bootstrap
```

## Build

```bash
npm run build
npm run build:lib
```

Library bundle output:

- `../dist/library/pixel-agents-council.es.js`
- `../dist/library/pixel-agents-council.umd.js`

## Embed Example

```tsx
import { PixelCouncilRoom, connectCouncilRoomWebSocket } from '@pixel-agents/council-room'

const connection = connectCouncilRoomWebSocket({
  url: 'ws://localhost:8001/v1/council-room/ws',
  token: process.env.VITE_COUNCIL_TOKEN,
  runOnConnectContent: 'Evaluate our launch plan',
})

export function App() {
  return <PixelCouncilRoom connection={connection} assetBaseUrl="/assets" />
}
```

`PixelCouncilRoom` now auto-loads council assets from `<assetBaseUrl>`:

- `furniture/furniture-catalog.json` + referenced PNGs (builds dynamic catalog)
- `characters/char_0.png ... char_5.png` (loads pre-colored member sprites)

If those files are missing, it falls back to built-in furniture and character templates.

## Asset Pipeline

Raw drops belong under monorepo `asset-drop/`.

Process dropped packs into runtime assets:

```bash
python scripts/process-dropped-council-assets.py
```

This writes synced outputs to both hosts:

- `webview-ui/public/assets/{characters,furniture}`
- `apps/pixel-agents-electron/public/assets/{characters,furniture}`
- `webview-ui/public/assets/fonts`
- `apps/pixel-agents-electron/public/assets/fonts`

It now imports both:

- single PNG furniture (`jik-a-4` office pack)
- `*-Sheet.png` sprite sheets from `asset-drop/furniture-pack/raw/Interior/**` (auto-sliced into selectable furniture assets)

Run/cancel messages:

```json
{ "type": "run", "runId": "optional-id", "content": "Your prompt" }
```

```json
{ "type": "cancel", "runId": "optional-id" }
```

## Host Bridge

UI host messaging resolves via `@pixel-agents/host-bridge`:

- `vscode`: uses `acquireVsCodeApi()`
- `electron`: uses `window.pixelAgentsHost`
- `browser`: safe no-op sender + window listener

## Dev Demo

```text
http://localhost:5173/?mode=council
http://localhost:5173/?mode=council&councilWs=ws://localhost:8001/v1/council-room/ws
```
