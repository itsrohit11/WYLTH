import { useEffect, useState } from 'react'
import { Modal } from './ui/Modal'
import { Input } from './ui/Input'
import { Button } from './ui/Button'
import toast from 'react-hot-toast'

export default function SettingsModal({ open, onClose, onSaved }) {
  const [f, setF] = useState({ daily_limit: '', low_balance_threshold: '' })
  const s = (k, v) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    window.api.settings.getAll().then(v => setF({
      daily_limit: v.daily_limit ? String(v.daily_limit) : '',
      low_balance_threshold: v.low_balance_threshold != null ? String(v.low_balance_threshold) : '3000',
    })).catch(() => {})
  }, [open])

  const save = async (e) => {
    e.preventDefault()
    await window.api.settings.set('daily_limit', Number(f.daily_limit) || 0)
    await window.api.settings.set('low_balance_threshold', Number(f.low_balance_threshold) || 0)
    toast.success('Settings saved')
    onSaved && onSaved()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Spending Alerts" size="sm">
      <form onSubmit={save} className="space-y-4">
        <div>
          <Input label="Daily spend limit (₹)" type="number" step="any" value={f.daily_limit}
            onChange={e => s('daily_limit', e.target.value)} placeholder="e.g. 1000 · 0 = off"/>
          <p className="text-[11px] text-muted mt-1">Warns you when a single day's spending goes over this.</p>
        </div>
        <div>
          <Input label="Low balance warning (₹)" type="number" step="any" value={f.low_balance_threshold}
            onChange={e => s('low_balance_threshold', e.target.value)} placeholder="e.g. 3000"/>
          <p className="text-[11px] text-muted mt-1">Warns when your Expense account falls below this, with days left in the month.</p>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  )
}
