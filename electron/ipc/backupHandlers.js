const { ipcMain, dialog, app, shell } = require('electron')
const { getDb, closeDatabase } = require('../database')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const dbPath = () => path.join(app.getPath('userData'), 'finance.db')
function backupsDir() {
  const d = path.join(app.getPath('userData'), 'backups')
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}

// Smallest possible backup: checkpoint the WAL into the main DB, then gzip the file.
function backupBuffer() {
  const db = getDb()
  try { db.pragma('wal_checkpoint(TRUNCATE)') } catch {}
  return zlib.gzipSync(fs.readFileSync(dbPath()), { level: 9 })
}

// Auto monthly backup: one gzipped snapshot per calendar month in userData/backups.
function autoMonthlyBackup() {
  try {
    const now = new Date()
    const tag = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const file = path.join(backupsDir(), `finance-${tag}.db.gz`)
    if (!fs.existsSync(file)) fs.writeFileSync(file, backupBuffer())
  } catch (e) { console.warn('auto backup failed:', e.message) }
}

module.exports = function registerBackupHandlers() {
  autoMonthlyBackup() // run once at startup

  ipcMain.handle('backup:now', async () => {
    const buf = backupBuffer()
    const def = path.join(app.getPath('documents') || app.getPath('home'),
      `finance-backup-${new Date().toISOString().split('T')[0]}.db.gz`)
    const { filePath } = await dialog.showSaveDialog({ title: 'Save Backup',
      defaultPath: def, filters: [{ name: 'Gzipped database', extensions: ['gz'] }] })
    if (!filePath) return { cancelled: true }
    fs.writeFileSync(filePath, buf)
    shell.showItemInFolder(filePath)
    return { success: true, filePath, size: buf.length }
  })

  ipcMain.handle('backup:list', () => {
    const dir = backupsDir()
    return fs.readdirSync(dir).filter(f => f.endsWith('.gz'))
      .map(f => ({ name: f, size: fs.statSync(path.join(dir, f)).size }))
      .sort((a, b) => b.name.localeCompare(a.name))
  })

  ipcMain.handle('backup:openFolder', () => { shell.openPath(backupsDir()); return { ok: true } })

  // Restore the database from a backup (.gz or .db). A safety copy of the current data is
  // taken first, then the app relaunches so the restored data loads cleanly.
  ipcMain.handle('backup:restore', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Restore from backup',
      properties: ['openFile'],
      filters: [{ name: 'Backup', extensions: ['gz', 'db'] }],
    })
    if (canceled || !filePaths || !filePaths[0]) return { cancelled: true }
    const src = filePaths[0]
    let buf
    try {
      buf = fs.readFileSync(src)
      if (src.toLowerCase().endsWith('.gz')) buf = zlib.gunzipSync(buf)
    } catch (e) { return { ok: false, error: 'Could not read that file: ' + e.message } }
    // Validate it's really a SQLite database before touching anything.
    if (buf.slice(0, 15).toString('utf8') !== 'SQLite format 3') {
      return { ok: false, error: 'That file is not a valid WYLTH backup.' }
    }
    // Safety backup of the CURRENT data first, so a restore can itself be undone.
    try { fs.writeFileSync(path.join(backupsDir(), `pre-restore-${Date.now()}.db.gz`), backupBuffer()) } catch {}
    // Swap the file, then relaunch.
    closeDatabase()
    const target = dbPath()
    try { fs.unlinkSync(target + '-wal') } catch {}
    try { fs.unlinkSync(target + '-shm') } catch {}
    try {
      fs.writeFileSync(target, buf)
    } catch (e) { return { ok: false, error: 'Could not write database: ' + e.message } }
    app.relaunch()
    app.exit(0)
    return { ok: true }
  })
}

module.exports.autoMonthlyBackup = autoMonthlyBackup
