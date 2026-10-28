const { app, BrowserWindow, Menu, shell } = require('electron')
const path = require('path')
const { initDatabase } = require('./database')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#f8fafc',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'default',
    title: 'WYLTH',
  })

  const url = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '..', 'dist', 'index.html')}`

  mainWindow.loadURL(url)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // DevTools no longer auto-opens. Open it manually any time via
  // the View > Toggle Developer Tools menu (or F12) if needed.
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Data Folder',
          click: () => shell.openPath(app.getPath('userData'))
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'maximize' },
        { type: 'separator' },
        { role: 'close' }
      ]
    }
  ]))
}

app.whenReady().then(() => {
  // Initialize SQLite database
  initDatabase()

  // Register all IPC handlers
  require('./ipc/salaryHandlers')()
  require('./ipc/expenseHandlers')()
  require('./ipc/savingHandlers')()
  require('./ipc/investmentHandlers')()
  require('./ipc/emergencyHandlers')()
  require('./ipc/analyticsHandlers')()
  require('./ipc/exportHandlers')()
  require('./ipc/bankHandlers')()
  require('./ipc/billHandlers')()
  require('./ipc/authHandlers')()
  require('./ipc/loanHandlers')()
  require('./ipc/recurringHandlers')()
  require('./ipc/notificationHandlers')()
  require('./ipc/reorderHandlers')()
  require('./ipc/backupHandlers')()
  require('./ipc/networthHandlers')()
  require('./ipc/cardHandlers')()
  require('./ipc/settingsHandlers')()
  require('./ipc/dematHandlers')()
  require('./ipc/saleHandlers')()
  require('./ipc/metaHandlers')()
  require('./ipc/noteHandlers')()

  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
