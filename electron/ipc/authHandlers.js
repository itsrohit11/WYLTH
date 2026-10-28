const { ipcMain } = require('electron')
const crypto = require('crypto')
const { getDb } = require('../database')

// Recovery code for resetting a forgotten password (per user's request).
const RESET_CODE = 'reset'

function hashPw(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex')
}

module.exports = function registerAuthHandlers() {
  const db = getDb()
  const get = (k) => db.prepare('SELECT value FROM app_settings WHERE key=?').get(k)?.value
  const set = (k, v) => db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).run(k, v)

  ipcMain.handle('auth:status', () => ({ hasPassword: !!get('pw_hash') }))

  ipcMain.handle('auth:setPassword', (_, { password }) => {
    if (!password) return { ok: false, error: 'Password required' }
    const salt = crypto.randomBytes(16).toString('hex')
    set('pw_salt', salt)
    set('pw_hash', hashPw(password, salt))
    return { ok: true }
  })

  ipcMain.handle('auth:verify', (_, { password }) => {
    const salt = get('pw_salt'), h = get('pw_hash')
    if (!salt || !h) return { ok: true } // no password configured -> open
    return { ok: hashPw(password, salt) === h }
  })

  // Reset requires the literal recovery code. Returns ok:false on a wrong code so the
  // UI can count attempts (max 5) and block further tries.
  ipcMain.handle('auth:resetWithCode', (_, { code, newPassword }) => {
    if (String(code) !== RESET_CODE) return { ok: false }
    if (!newPassword) return { ok: false, error: 'New password required' }
    const salt = crypto.randomBytes(16).toString('hex')
    set('pw_salt', salt)
    set('pw_hash', hashPw(newPassword, salt))
    return { ok: true }
  })
}
