/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COUNCIL_WS_URL?: string
  readonly VITE_COUNCIL_TOKEN?: string
  readonly VITE_COUNCIL_ROOM_ZOOM?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
