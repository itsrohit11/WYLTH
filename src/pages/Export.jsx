import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { FileSpreadsheet, Download, LayoutDashboard, Receipt, Landmark, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const TABS = [
  { icon: LayoutDashboard, name: 'Overview', text: 'Salary plan vs actual, net worth, investments, emergency fund, savings, debts and lends' },
  { icon: Receipt, name: 'Expense', text: 'Every day of the month, category totals with change vs last month, recurring and bills' },
  { icon: Landmark, name: 'Banks & Cards', text: 'All bank accounts and credit cards, with this month’s card spends' },
  { icon: TrendingUp, name: 'Investments', text: 'Grouped by type with gain/loss highlighted' },
]

export default function Export() {
  const [months, setMonths] = useState([])
  const [ym, setYm] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    window.api.export.months().then(m => { setMonths(m); if (m[0]) setYm(m[0].ym) }).catch(() => {})
  }, [])

  const sel = months.find(m => m.ym === ym)
  const cur = new Date().getFullYear()
  const fileName = sel ? `WYLTH_${MONTHS[sel.month - 1]}${sel.year !== cur ? '_' + sel.year : ''}.xlsx` : ''

  const handleExcel = async () => {
    if (!sel) return
    setExporting(true)
    try {
      const result = await window.api.export.excel({ year: sel.year, month: sel.month })
      if (result.success) toast.success(`${fileName} is ready`)
      else if (result.cancelled) toast('Export cancelled', { icon: 'ℹ️' })
      else toast.error(result.error || 'Export failed')
    } catch (e) { toast.error(e.message) } finally { setExporting(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-content">Export to Excel</h2>
        <p className="text-sm text-muted">Pick a month and get one tidy workbook for it</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileSpreadsheet size={20} className="text-green-600"/> Monthly report</CardTitle></CardHeader>
        <CardContent>
          <label className="block text-xs font-medium text-muted mb-1.5">Month</label>
          <select value={ym} onChange={e => setYm(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface-2 text-content px-3 py-3 text-sm mb-2">
            {months.map(m => <option key={m.ym} value={m.ym}>{m.label}</option>)}
          </select>
          <p className="text-xs text-faint mb-5">Only this month and earlier months are listed. File name: <b className="text-muted">{fileName || '…'}</b></p>
          <div className="space-y-3 mb-6">
            {TABS.map(({ icon: Icon, name, text }) => (
              <div key={name} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center shrink-0"><Icon size={16} className="text-brand-400"/></div>
                <div><p className="text-sm font-semibold text-content leading-tight">{name}</p><p className="text-xs text-muted">{text}</p></div>
              </div>
            ))}
          </div>
          <Button onClick={handleExcel} loading={exporting} disabled={!sel} className="w-full" variant="success">
            <Download size={16}/> {exporting ? 'Preparing…' : 'Download Excel'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
