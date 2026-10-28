import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { FileSpreadsheet, Database, FolderOpen, Download, CheckCircle, Upload, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Export() {
  const [exporting, setExporting] = useState(false)
  const [backing, setBacking] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)

  const handleRestore = async () => {
    setRestoreOpen(false)
    try {
      const r = await window.api.backup.restore()
      if (!r || r.cancelled) return
      if (r.ok) toast.success('Restoring… the app will restart')
      else toast.error(r.error || 'Restore failed')
    } catch (e) { toast.error(e.message) }
  }

  const handleBackup = async () => {
    setBacking(true)
    try {
      const r = await window.api.backup.now()
      if (r.success) toast.success(`Compact backup saved (${(r.size/1024).toFixed(0)} KB)`)
      else if (r.cancelled) toast('Backup cancelled', { icon: 'ℹ️' })
    } catch (e) { toast.error(e.message) } finally { setBacking(false) }
  }
  const handleOpenBackups = async () => { await window.api.backup.openFolder() }

  const handleExcel = async () => {
    setExporting(true)
    try {
      const result = await window.api.export.excel()
      if (result.success) toast.success(`Exported to ${result.path}`)
      else if (result.cancelled) toast('Export cancelled', { icon: 'ℹ️' })
      else toast.error('Export failed')
    } catch(e) { toast.error(e.message) } finally { setExporting(false) }
  }

  const handleOpenFolder = async () => {
    await window.api.export.openDbFolder()
  }

  const handleGetPath = async () => {
    const p = await window.api.export.getDbPath()
    toast(`Database: ${p}`, { duration: 5000, icon: '📁' })
  }

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-bold text-content">Export & Backup</h2>
        <p className="text-sm text-muted">Export your data and manage backups</p></div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileSpreadsheet size={20} className="text-green-600"/> Excel Export</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted mb-4">Export everything to a multi-sheet Excel workbook with a <strong>Summary</strong> tab and a <strong>TOTAL row on every sheet</strong> so it tallies automatically.</p>
            <ul className="text-sm text-muted space-y-1 mb-6">
              {['Summary of all totals & net worth','Expenses, Salary, Savings, Investments','Bank, Bills, Recurring, Lending & Debts','Each sheet ends with a TOTAL row'].map(i=>(
                <li key={i} className="flex items-center gap-2"><CheckCircle size={13} className="text-green-500"/>{i}</li>
              ))}
            </ul>
            <Button onClick={handleExcel} loading={exporting} className="w-full" variant="success">
              <Download size={16}/> {exporting ? 'Exporting…' : 'Export to Excel (.xlsx)'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Database size={20} className="text-brand-600"/> SQLite Database</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted mb-4">Your data is stored in a local SQLite database file on your computer. You can back it up by copying the <code className="bg-surface-2 px-1 rounded text-xs">finance.db</code> file.</p>
            <div className="space-y-3 mt-4">
              <Button onClick={handleBackup} loading={backing} className="w-full" variant="success">
                <Download size={16}/> {backing ? 'Backing up…' : 'Create Compact Backup (.gz)'}
              </Button>
              <Button onClick={handleOpenBackups} className="w-full" variant="outline">
                <FolderOpen size={16}/> Open Backups Folder
              </Button>
              <Button onClick={()=>setRestoreOpen(true)} className="w-full" variant="outline">
                <Upload size={16}/> Restore from Backup…
              </Button>
              <Button onClick={handleGetPath} className="w-full" variant="secondary">
                <Database size={16}/> Show Database Path
              </Button>
            </div>
            <p className="text-xs text-faint mt-4">A small compressed backup is also created <strong>automatically once a month</strong>. Restore replaces your current data with a backup (a safety copy is taken first) and restarts the app.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-brand-100 bg-brand-50">
        <CardContent className="py-4">
          <h3 className="text-sm font-semibold text-brand-900 mb-2">Backup Recommendations</h3>
          <p className="text-sm text-brand-800">Copy your <strong>finance.db</strong> file to a safe location (Google Drive, OneDrive, external drive) weekly. This ensures you never lose your financial data.</p>
        </CardContent>
      </Card>

      <Modal open={restoreOpen} onClose={()=>setRestoreOpen(false)} title="Restore from Backup" size="sm">
        <div className="space-y-4">
          <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5"/>
            <p className="text-sm text-content">This replaces <strong>all current data</strong> with the backup you choose. A safety copy of your current data is saved first, and the app will restart afterwards.</p>
          </div>
          <p className="text-xs text-muted">You'll be asked to pick a <code className="bg-surface-2 px-1 rounded">.gz</code> or <code className="bg-surface-2 px-1 rounded">.db</code> backup file.</p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={()=>setRestoreOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleRestore}><Upload size={16}/> Choose file &amp; Restore</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
