import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input, Select, Textarea } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { formatCurrency } from '../lib/utils'
import { useDnd } from '../lib/useDnd'
import { Plus, Pencil, Trash2, FileText, GripVertical, Repeat } from 'lucide-react'
import { UpdatedAt } from '../components/ui/UpdatedAt'

const BILL_TYPES = ['SUBSCRIPTION', 'RENT', 'EMI', 'UTILITY', 'INSURANCE', 'PHONE_RECHARGE', 'MAINTENANCE', 'CREDIT_CARD', 'OTHER']
const typeLabel = {
  SUBSCRIPTION:'Subscription', RENT:'Rent', EMI:'EMI', UTILITY:'Utility', INSURANCE:'Insurance',
  PHONE_RECHARGE:'Phone Recharge', MAINTENANCE:'Maintenance', CREDIT_CARD:'Credit Card', OTHER:'Other',
}
const todayStr = () => new Date().toISOString().split('T')[0]

function BillForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial ? {
    title:initial.title, type:initial.type||'OTHER', amount:initial.amount, date:initial.date||todayStr(),
    notes:initial.notes||'', monthly:!!initial.monthly, due_day:initial.due_day||''
  } : { title:'', type:'SUBSCRIPTION', amount:'', date:todayStr(), notes:'', monthly:true, due_day:'' })
  const s=(k,v)=>setF(p=>({...p,[k]:v}))
  const submit=async(e)=>{ e.preventDefault(); await onSave(f); onClose() }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Input label="Title" value={f.title} onChange={e=>s('title',e.target.value)} placeholder="e.g. Netflix, House Rent, Bike EMI" required/>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Type" value={f.type} onChange={e=>s('type',e.target.value)}>
          {BILL_TYPES.map(t=><option key={t} value={t}>{typeLabel[t]}</option>)}
        </Select>
        <Input label="Amount (₹)" type="number" step="any" value={f.amount} onChange={e=>s('amount',e.target.value)} required/>
      </div>
      <label className="flex items-center gap-2 text-sm text-content cursor-pointer">
        <input type="checkbox" checked={f.monthly} onChange={e=>s('monthly',e.target.checked)} className="w-4 h-4 accent-brand-600 rounded"/>
        Recurring monthly (rent, EMI, subscription…)
      </label>
      {f.monthly
        ? <Input label="Due day of month (1-31)" type="number" min={1} max={31} value={f.due_day} onChange={e=>s('due_day',e.target.value)} placeholder="e.g. 5"/>
        : <Input label="Date" type="date" value={f.date} onChange={e=>s('date',e.target.value)} required/>}
      <Textarea label="Notes" value={f.notes} onChange={e=>s('notes',e.target.value)} rows={2}/>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">{initial?'Update':'Add'} {f.monthly?'Subscription/Bill':'Bill'}</Button>
      </div>
    </form>
  )
}

export default function Bills({ onChange }) {
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState({ open:false, item:null })

  const load = () => { setLoading(true); window.api.bill.getAll().then(x=>{ setBills(x); onChange?.() }).catch(()=>{}).finally(()=>setLoading(false)) }
  useEffect(()=>{ load() }, [])

  const total = bills.reduce((s,b)=>s+Number(b.amount),0)
  const monthlyTotal = bills.filter(b=>b.monthly).reduce((s,b)=>s+Number(b.amount),0)
  const oneTimeTotal = total - monthlyTotal
  const save = async (d) => { if (modal.item) await window.api.bill.update(modal.item.id, d); else await window.api.bill.create(d); load() }
  const del = async (id) => { await window.api.bill.delete(id); load() }
  const { itemProps } = useDnd(bills, async (arr) => { setBills(arr); await window.api.reorder('bills', arr.map(b => b.id)) })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-content">Subscriptions &amp; Bills</h2>
          <p className="text-sm text-muted">Rent, EMIs, subscriptions &amp; bills — tracked here, separate from your expense budget</p></div>
        <Button onClick={()=>setModal({open:true,item:null})}><Plus size={16}/> Add Subscription / Bill</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {label:'Total', value:total, cls:'text-content'},
          {label:'Monthly (recurring)', value:monthlyTotal, cls:'text-brand-600'},
          {label:'One-time', value:oneTimeTotal, cls:'text-amber-600'},
          {label:'Items', value:null, count:bills.length, cls:'text-content'},
        ].map(c=>(
          <Card key={c.label}><CardContent className="py-4 text-center">
            <p className={`text-xl font-bold tabular ${c.cls}`}>{c.value==null?c.count:formatCurrency(c.value)}</p>
            <p className="text-xs text-muted mt-1">{c.label}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>
          : bills.length===0 ? (
            <div className="text-center py-16 text-faint"><FileText size={40} className="mx-auto mb-3 text-faint"/><p>No subscriptions or bills yet</p></div>
          ) : (
            <div className="divide-y divide-line">
              {bills.map((b, idx)=>(
                <div key={b.id} {...itemProps(idx)} className="flex items-center justify-between px-4 py-3 hover:bg-surface-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <GripVertical size={14} className="text-faint cursor-grab shrink-0"/>
                    <div className="min-w-0">
                    <p className="text-sm font-medium text-content">{b.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="info">{typeLabel[b.type]||b.type}</Badge>
                      {b.monthly
                        ? <span className="inline-flex items-center gap-1 text-xs text-brand-600"><Repeat size={11}/> Monthly{b.due_day?` · day ${b.due_day}`:''}</span>
                        : <span className="text-xs text-faint">{b.date}</span>}
                      {b.notes && <span className="text-xs text-faint truncate max-w-[160px]">· {b.notes}</span>}
                      <UpdatedAt at={b.updated_at} icon={false}/>
                    </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold mr-1 tabular">{formatCurrency(b.amount)}{b.monthly?<span className="text-xs font-normal text-faint">/mo</span>:null}</span>
                    <Button size="icon" variant="ghost" onClick={()=>setModal({open:true,item:b})}><Pencil size={13} className="text-muted"/></Button>
                    <Button size="icon" variant="ghost" onClick={()=>del(b.id)}><Trash2 size={13} className="text-red-400"/></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={modal.open} onClose={()=>setModal({open:false,item:null})} title={modal.item?'Edit Subscription / Bill':'Add Subscription / Bill'}>
        <BillForm initial={modal.item} onSave={save} onClose={()=>setModal({open:false,item:null})}/>
      </Modal>
    </div>
  )
}
