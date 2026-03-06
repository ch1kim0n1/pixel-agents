import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import CouncilDemoApp from './CouncilDemoApp.tsx'
import LandingPage from './LandingPage.tsx'

type RootView = 'landing' | 'council' | 'editor'

function hasVsCodeApi(): boolean {
  return typeof (window as Window & { acquireVsCodeApi?: unknown }).acquireVsCodeApi === 'function'
}

function getRootView(): RootView {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode')
  if (mode === 'council') return 'council'
  if (mode === 'editor') return 'editor'
  if (hasVsCodeApi()) return 'editor'
  return 'landing'
}

const rootView = getRootView()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {rootView === 'council' ? <CouncilDemoApp /> : rootView === 'editor' ? <App /> : <LandingPage />}
  </StrictMode>,
)
