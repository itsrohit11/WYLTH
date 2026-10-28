const { ipcMain } = require('electron')
const { getDb } = require('../database')

// Simple key/value app settings (stored in app_settings). Used for the spend warnings.
const DEFAULTS = { daily_limit: 0, low_balance_threshold: 3000 }

module.exports = function registerSettingsHandlers() {
  const db = getDb()

  ipcMain.handle('settings:getAll', () => {
    const out = { ...DEFAULTS }
    for (const r of db.prepare('SELECT key, value FROM app_settings').all()) {
      if (r.key in DEFAULTS) out[r.key] = Number(r.value) || 0
    }
    return out
  })

  ipcMain.handle('settings:set', (_, { key, value }) => {
    db.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, String(value))
    return { ok: true }
  })
}
