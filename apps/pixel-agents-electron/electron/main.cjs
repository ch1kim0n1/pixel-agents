const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const chokidar = require('chokidar')
const pty = require('node-pty')
const Store = require('electron-store')

const store = new Store({ name: 'pixel-agents' })
const terminals = new Map()
const transcriptWatchers = new Map()
const transcriptOffsets = new Map()
const transcriptLineBuffers = new Map()

let mainWindow = null
let nextTerminalIndex = 1

function getRendererUrl() {
  return process.env.PIXEL_AGENTS_ELECTRON_RENDERER_URL
}

function shouldOpenDevTools() {
  const raw = String(process.env.PIXEL_AGENTS_OPEN_DEVTOOLS || '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

function createTerminalId() {
  const index = nextTerminalIndex++
  return `terminal-${index}`
}

function normalizeWorkspacePath(workspacePath) {
  const resolved = path.resolve(workspacePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function getWorkspaceProjectDirCandidates(workspacePath) {
  const normalized = normalizeWorkspacePath(workspacePath)
  const hashed = crypto.createHash('sha1').update(normalized).digest('hex')
  const legacyDirName = workspacePath.replace(/[^a-zA-Z0-9-]/g, '-')
  const basePath = path.join(os.homedir(), '.claude', 'projects')
  return [...new Set([
    path.join(basePath, hashed),
    path.join(basePath, legacyDirName),
  ])]
}

function sendHostEvent(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('pixel-agents:host-message', payload)
}

function cleanupTerminal(terminalId) {
  const entry = terminals.get(terminalId)
  if (!entry) return
  try {
    entry.ptyProcess.kill()
  } catch {
    // ignore kill failures
  }
  terminals.delete(terminalId)
}

function emitNewTranscriptLines(filePath, label) {
  try {
    const stat = fs.statSync(filePath)
    const prevOffset = transcriptOffsets.get(filePath) || 0
    if (stat.size <= prevOffset) return

    const fd = fs.openSync(filePath, 'r')
    const buffer = Buffer.alloc(stat.size - prevOffset)
    fs.readSync(fd, buffer, 0, buffer.length, prevOffset)
    fs.closeSync(fd)
    transcriptOffsets.set(filePath, stat.size)

    const nextText = `${transcriptLineBuffers.get(filePath) || ''}${buffer.toString('utf8')}`
    const lines = nextText.split('\n')
    transcriptLineBuffers.set(filePath, lines.pop() || '')
    for (const line of lines) {
      if (!line.trim()) continue
      sendHostEvent({
        type: 'host.transcript.line',
        filePath,
        label,
        line,
      })
    }
  } catch {
    // ignore file-read failures
  }
}

function ensureTranscriptWatcher(workspacePath, label) {
  const projectDirs = getWorkspaceProjectDirCandidates(workspacePath)
  for (const projectDir of projectDirs) {
    if (transcriptWatchers.has(projectDir)) continue
    const watcher = chokidar.watch(path.join(projectDir, '*.jsonl'), {
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 250,
        pollInterval: 100,
      },
    })

    watcher.on('add', (filePath) => emitNewTranscriptLines(filePath, label))
    watcher.on('change', (filePath) => emitNewTranscriptLines(filePath, label))
    watcher.on('error', (error) => {
      sendHostEvent({
        type: 'host.transcript.error',
        label,
        projectDir,
        error: String(error),
      })
    })

    transcriptWatchers.set(projectDir, watcher)
  }
}

function getShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

function spawnTerminal(payload) {
  const terminalId = createTerminalId()
  const label = String(payload.displayName || terminalId)
  const cwd = payload.cwd && typeof payload.cwd === 'string'
    ? payload.cwd
    : process.cwd()

  const ptyProcess = pty.spawn(getShell(), [], {
    cols: 120,
    rows: 36,
    cwd,
    env: process.env,
  })

  terminals.set(terminalId, { ptyProcess, label, cwd })
  ensureTranscriptWatcher(cwd, label)

  ptyProcess.onData((data) => {
    sendHostEvent({
      type: 'host.terminal.data',
      terminalId,
      label,
      data,
    })
  })
  ptyProcess.onExit((event) => {
    sendHostEvent({
      type: 'host.terminal.exit',
      terminalId,
      label,
      exitCode: event.exitCode,
      signal: event.signal,
    })
    cleanupTerminal(terminalId)
  })

  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  ptyProcess.write(`claude --session-id ${sessionId}\r`)

  return { terminalId, label }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1720,
    height: 980,
    minWidth: 1200,
    minHeight: 720,
    backgroundColor: '#0f161b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const rendererUrl = getRendererUrl()
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
    if (shouldOpenDevTools()) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function sendResponse(sender, requestId, payload = {}) {
  sender.send('pixel-agents:host-message', { requestId, ok: true, ...payload })
}

function sendError(sender, requestId, error) {
  sender.send('pixel-agents:host-message', {
    requestId,
    ok: false,
    error: typeof error === 'string' ? error : String(error),
  })
}

function handleHostRequest(event, payload) {
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : null
  if (!requestId) return

  try {
    if (payload.type === 'host.spawnTerminal') {
      const created = spawnTerminal(payload)
      sendResponse(event.sender, requestId, created)
      return
    }

    if (payload.type === 'host.focusTerminal') {
      const terminalId = String(payload.terminalId || '')
      const entry = terminals.get(terminalId)
      if (entry) {
        sendHostEvent({
          type: 'host.terminal.data',
          terminalId,
          label: entry.label,
          data: '\n[focused]\n',
        })
      }
      sendResponse(event.sender, requestId)
      return
    }

    if (payload.type === 'host.closeTerminal') {
      const terminalId = String(payload.terminalId || '')
      cleanupTerminal(terminalId)
      sendResponse(event.sender, requestId)
      return
    }

    if (payload.type === 'host.readLayout') {
      const layout = store.get('layout', null)
      sendResponse(event.sender, requestId, { layout })
      return
    }

    if (payload.type === 'host.writeLayout') {
      const layout = payload.layout && typeof payload.layout === 'object'
        ? payload.layout
        : null
      store.set('layout', layout)
      sendResponse(event.sender, requestId)
      return
    }

    if (payload.type === 'openExternal') {
      const url = typeof payload.url === 'string' ? payload.url : ''
      if (url) {
        void shell.openExternal(url)
      }
      sendResponse(event.sender, requestId)
      return
    }

    sendError(event.sender, requestId, `Unknown host request: ${String(payload.type)}`)
  } catch (error) {
    sendError(event.sender, requestId, error)
  }
}

app.whenReady().then(() => {
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  for (const [terminalId] of terminals) {
    cleanupTerminal(terminalId)
  }
  for (const [, watcher] of transcriptWatchers) {
    void watcher.close()
  }
  transcriptWatchers.clear()
})

ipcMain.on('pixel-agents:renderer-message', (event, rawPayload) => {
  const payload = rawPayload && typeof rawPayload === 'object'
    ? rawPayload
    : {}
  handleHostRequest(event, payload)
})
