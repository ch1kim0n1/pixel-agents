import { resolvePixelAgentsHostBridge } from '@pixel-agents/host-bridge'

export const hostBridge = resolvePixelAgentsHostBridge()

export const vscode = {
  postMessage: (message: unknown) => {
    hostBridge.postMessage(message)
  },
}
