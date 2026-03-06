export type PixelAgentsHostKind = 'vscode' | 'electron' | 'browser'

export interface PixelAgentsHostBridge {
  readonly kind: PixelAgentsHostKind
  postMessage: (message: unknown) => void
  addMessageListener: (listener: (message: unknown) => void) => () => void
}

interface VsCodeWebviewApi {
  postMessage: (message: unknown) => void
}

interface ElectronHostApi {
  postMessage: (message: unknown) => void
  onMessage: (listener: (message: unknown) => void) => (() => void) | void
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeWebviewApi
    pixelAgentsHost?: ElectronHostApi
  }
}

function addWindowMessageListener(
  listener: (message: unknown) => void,
): () => void {
  const handler = (event: MessageEvent): void => {
    listener(event.data)
  }
  window.addEventListener('message', handler)
  return () => {
    window.removeEventListener('message', handler)
  }
}

function resolveVsCodeBridge(): PixelAgentsHostBridge | null {
  if (typeof window.acquireVsCodeApi !== 'function') return null
  const api = window.acquireVsCodeApi()
  return {
    kind: 'vscode',
    postMessage: (message: unknown) => {
      api.postMessage(message)
    },
    addMessageListener: addWindowMessageListener,
  }
}

function resolveElectronBridge(): PixelAgentsHostBridge | null {
  const api = window.pixelAgentsHost
  if (!api) return null
  return {
    kind: 'electron',
    postMessage: (message: unknown) => {
      api.postMessage(message)
    },
    addMessageListener: (listener: (message: unknown) => void) => {
      const dispose = api.onMessage(listener)
      if (typeof dispose === 'function') return dispose
      return () => {
        // no-op fallback when host does not provide an unsubscribe handle
      }
    },
  }
}

function createBrowserBridge(): PixelAgentsHostBridge {
  return {
    kind: 'browser',
    postMessage: () => {
      // No-op outside VS Code/Electron host.
    },
    addMessageListener: addWindowMessageListener,
  }
}

export function resolvePixelAgentsHostBridge(): PixelAgentsHostBridge {
  return (
    resolveVsCodeBridge()
    ?? resolveElectronBridge()
    ?? createBrowserBridge()
  )
}

