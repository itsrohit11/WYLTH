const { ipcMain, dialog, shell } = require('electron')
const { getDb } = require('../database')
const { buildMonthlyWorkbook, availableMonths, fileNameFor } = require('../lib/monthlyReport')
const fs = require('fs')
const path = require('path')
const os = require('os')

module.exports = function registerExportHandlers() {
  const db = getDb()

  // Months a report can be made for (this month and earlier months that have data).
  ipcMain.handle('export:months', () => availableMonths(db))

  // One month → one workbook named WYLTH_<Month>.xlsx (Overview, Expense, Banks & Cards, Investments).
  ipcMain.handle('export:excel', async (event, opts = {}) => {
    const now = new Date()
    const year = Number(opts && opts.year) || now.getFullYear()
    const month = Number(opts && opts.month) || now.getMonth() + 1
    let wb
    try { wb = await buildMonthlyWorkbook(db, year, month) } catch (e) { return { success: false, error: e.message } }
    const { filePath } = await dialog.showSaveDialog({
      title: 'Save Excel report',
      defaultPath: path.join(os.homedir(), fileNameFor(year, month)),
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    })
    if (!filePath) return { cancelled: true }
    const buf = await wb.xlsx.writeBuffer()
    fs.writeFileSync(filePath, Buffer.from(buf))
    shell.showItemInFolder(filePath)
    return { success: true, filePath }
  })
}
