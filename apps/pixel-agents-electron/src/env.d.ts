/// <reference types="vite/client" />

declare global {
  interface Window {
    pixelAgentsHost?: {
      postMessage: (message: unknown) => void
      onMessage: (listener: (message: unknown) => void) => (() => void) | void
    }
  }
}

export {}
