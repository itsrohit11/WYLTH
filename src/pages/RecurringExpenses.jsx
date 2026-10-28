import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input, Select, Textarea } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { formatCurrency } from '../lib/utils'
import toast from 'react-hot-toast'
import { useDnd } from '../lib/useDnd'
import { Plus, Pencil, Trash2, Repeat, GripVertical, Check } from 'lucide-react'

const CATEGORIES = ['Rent', 'EMI', 'Grocery', 'Maid', 'Cook', 'Bills', 'Utilities', 'Subscription', 'Insurance', 'Other']

function RecurringForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial ? {
    title:initial.title, category:initial.category||'Other', amount:initial.amount,
    due_day:initial.due_day||'', active:initial.active!==0, notes:initial.notes||''
  } : { title:'', category:'Rent', amount:'', due_day:'', active:true, notes:'' })
  const s=(k,v)=>setF(p=>({...p,[k]:v}))
  const submit=async(e)=>{ e.preventDefault(); await onSave(f); onClose() }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Input label="Name" value={f.title} onChange={e=>s('title',e.target.value)} placeholder="e.g. House Rent, Bike EMI, Maid" required/>
      <div className="grid grid-cols-3 gap-3">
        <Select label="Category" value={f.category} onChange={e=>s('category',e.target.value)}>
          {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
        </Select>
        <Input label="Amount / month (₹)" type="number" step="any" value={f.amount} onChange={e=>s('amount',e.target.value)} required/>
        <Input label="Due day" type="number" min={1} max={31} value={f.due_day} onChange={e=>s('due_day',e.target.value)} placeholder="1-31"/>
      </div>
      <label className="flex items-center gap-2 text-sm text-content cursor-pointer">
        <input type="checkbox" checked={f.active} onChange={e=>s('active',e.target.checked)} className="w-4 h-4 accent-brand-600 rounded"/>
        Active
      </label>
      <Textarea label="Notes" value={f.notes} onChange={e=>s('notes',e.target.value)} rows={2}/>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">{initial?'Update':'Add'} Recurring Expense</Button>
      </div>
    </form>
  )
}

export default function RecurringExpenses({ onChange }) {
  const [items, setItems] = useState([])
  const [paid, setPaid] = useState({})
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState({ open:false, item:null })

  const load = () => {
    setLoading(true)
    window.api.recurring.getAll().then(x=>{ setItems(x); onChange?.() }).catch(()=>{}).finally(()=>setLoading(false))
    window.api.recurring.paidStatus().then(setPaid).catch(()=>setPaid({}))
  }
  useEffect(()=>{ load() }, [])

  const activeItems = items.filter(i=>i.active!==0)
  const monthlyTotal = activeItems.reduce((s,i)=>s+Number(i.amount),0)
  const paidCount = activeItems.filter(i=>paid[i.id]).length
  const save = async (d) => { if (modal.item) await window.api.recurring.update(modal.item.id, d); else await window.api.recurring.create(d); load() }
  const del = async (id) => { await window.api.recurring.delete(id); load() }
  const markPaid = async (id) => {
    const r = await window.api.recurring.markPaid(id)
    if (r?.debited > 0 && r.account) toast.success(`${formatCurrency(r.debited)} taken out of ${r.account.name} — balance ${formatCurrency(r.account.balance)}`)
    else if (!r?.already) toast('Logged as an expense. No Expense account is set up, so no bank balance changed.', { icon: 'ℹ️' })
    load()
  }
  const unmarkPaid = async (id) => { await window.api.recurring.unmarkPaid(id); toast.success('Undone — money returned to the account'); load() }
  const { itemProps } = useDnd(items, async (arr) => { setItems(arr); await window.api.reorder('recurring_expenses', arr.map(i => i.id)) })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-content">Recurring Expenses</h2>
          <p className="text-sm text-muted">Your fixed monthly commitments — rent, EMIs, grocery, maid, cook, bills…</p></div>
        <Button onClick={()=>setModal({open:true,item:null})}><Plus size={16}/> Add</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="py-4 text-center">
          <p className="text-2xl font-bold text-brand-600">{formatCurrency(monthlyTotal)}</p>
          <p className="text-xs text-muted mt-1">Total per month (active)</p>
        </CardContent></Card>
        <Card><CardContent className="py-4 text-center">
          <p className="text-2xl font-bold text-content">{activeItems.length}</p>
          <p className="text-xs text-muted mt-1">Active items</p>
        </CardContent></Card>
        <Card><CardContent className="py-4 text-center">
          <p className="text-2xl font-bold text-green-600">{paidCount}<span className="text-base text-faint">/{activeItems.length}</span></p>
          <p className="text-xs text-muted mt-1">Paid this month</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>
          : items.length===0 ? (
            <div className="text-center py-16 text-faint"><Repeat size={40} className="mx-auto mb-3 text-faint"/><p>No recurring expenses yet</p></div>
          ) : (
            <div className="divide-y divide-line">
              {items.map((i, idx)=>(
                <div key={i.id} {...itemProps(idx)} className={`flex items-center justify-between px-4 py-3 hover:bg-surface-2 ${i.active===0?'opacity-50':''}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <GripVertical size={14} className="text-faint cursor-grab shrink-0"/>
                    <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-content">{i.title}</p>
                      <Badge variant="info">{i.category}</Badge>
                      {i.active===0 && <Badge variant="default">Paused</Badge>}
                    </div>
                    <p className="text-xs text-faint">{i.due_day?`Due day ${i.due_day}`:'Monthly'}{i.notes?` · ${i.notes}`:''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold mr-1">{formatCurrency(i.amount)}<span className="text-xs font-normal text-faint">/mo</span></span>
                    {i.active!==0 && (paid[i.id]
                      ? <button onClick={()=>unmarkPaid(i.id)} title="Undo — removes the expense it created" className="text-[11px] font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-md flex items-center gap-1 hover:bg-green-200 transition-colors"><Check size={12}/> Paid</button>
                      : <button onClick={()=>markPaid(i.id)} title="Log this as an expense for this month" className="text-[11px] font-medium text-brand-700 border border-brand-200 px-2 py-1 rounded-md hover:bg-brand-50 transition-colors">Mark paid</button>
                    )}
                    <Button size="icon" variant="ghost" onClick={()=>setModal({open:true,item:i})}><Pencil size={13} className="text-muted"/></Button>
                    <Button size="icon" variant="ghost" onClick={()=>del(i.id)}><Trash2 size={13} className="text-red-400"/></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={modal.open} onClose={()=>setModal({open:false,item:null})} title={modal.item?'Edit Recurring Expense':'Add Recurring Expense'}>
        <RecurringForm initial={modal.item} onSave={save} onClose={()=>setModal({open:false,item:null})}/>
      </Modal>
    </div>
  )
}
