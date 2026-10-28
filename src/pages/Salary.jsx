import { useEffect, useState } from 'react'
import { useSalaryStore } from '../stores/salaryStore'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input, Select, Textarea } from '../components/ui/Input'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Badge } from '../components/ui/Badge'
import { formatCurrency, MONTHS } from '../lib/utils'
import { Plus, Pencil, Trash2, IndianRupee } from 'lucide-react'
import toast from 'react-hot-toast'
import { UpdatedAt } from '../components/ui/UpdatedAt'

const CY = new Date().getFullYear()
const YEARS = [CY-1, CY, CY+1]

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10

function SalaryForm({ initial, onSave, onClose }) {
  // `mode` decides whether the three inputs are read as rupees or percentages.
  // We default to ₹ since that's how the salary is actually split month to month.
  const [mode, setMode] = useState('amount')
  const [f, setF] = useState(initial ? {
    month: initial.month, year: initial.year, total_salary: initial.total_salary,
    needs: initial.needs_amount ?? '', wants: initial.wants_amount ?? '', invest: initial.investment_amount ?? '',
    notes: initial.notes || '',
  } : { month: new Date().getMonth()+1, year: CY, total_salary:'', needs:'', wants:'', invest:'', notes:'' })

  const s = (k,v) => setF(p=>({...p,[k]:v}))
  const total = Number(f.total_salary) || 0
  const byAmt = mode === 'amount'

  // Convert a single input field to ₹ and to % based on the active mode.
  const toAmt = (v) => byAmt ? (Number(v)||0) : total*(Number(v)||0)/100
  const toPct = (v) => byAmt ? (total>0 ? round1((Number(v)||0)/total*100) : 0) : (Number(v)||0)

  const needsAmt = toAmt(f.needs), wantsAmt = toAmt(f.wants), investAmt = toAmt(f.invest)
  const savingsAmt = total - needsAmt - wantsAmt - investAmt
  const needsPct = toPct(f.needs), wantsPct = toPct(f.wants), investPct = toPct(f.invest)
  const savingsPct = total>0 ? round1(savingsAmt/total*100) : 0

  // Switching units keeps the numbers meaningful by converting what's already typed.
  const switchMode = (m) => {
    if (m === mode) return
    setF(p => {
      const cv = (v) => {
        if (v === '' || v === null || v === undefined) return ''
        const num = Number(v) || 0
        if (total <= 0) return ''
        return m === 'percent' ? String(round1(num/total*100)) : String(Math.round(total*num/100))
      }
      return { ...p, needs:cv(p.needs), wants:cv(p.wants), invest:cv(p.invest) }
    })
    setMode(m)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (savingsAmt < -0.5) { toast.error('Recurring + Personal + Investment cannot exceed your salary'); return }
    await onSave({
      month: f.month, year: f.year, total_salary: total, notes: f.notes,
      needs_amount: needsAmt, wants_amount: wantsAmt, investment_amount: investAmt, savings_amount: savingsAmt,
      needs_percentage: needsPct, wants_percentage: wantsPct, investment_percentage: investPct, savings_percentage: savingsPct,
    })
    onClose()
  }

  const rows = [
    {key:'needs', label:'Recurring', color:'blue', amt:needsAmt, pct:needsPct},
    {key:'wants', label:'Personal', color:'orange', amt:wantsAmt, pct:wantsPct},
    {key:'invest', label:'Investment', color:'purple', amt:investAmt, pct:investPct},
  ]

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Select label="Month" value={f.month} onChange={e=>s('month',Number(e.target.value))}>
          {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
        </Select>
        <Select label="Year" value={f.year} onChange={e=>s('year',Number(e.target.value))}>
          {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
        </Select>
      </div>
      <Input label="Total Salary (₹)" type="number" value={f.total_salary} onChange={e=>s('total_salary',e.target.value)} placeholder="e.g. 80000" required/>

      <div className="bg-brand-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-brand-900">Allocate your salary</p>
          <div className="inline-flex rounded-lg border border-brand-200 bg-surface p-0.5 text-xs font-medium">
            {[{m:'amount',l:'By ₹'},{m:'percent',l:'By %'}].map(({m,l})=>(
              <button key={m} type="button" onClick={()=>switchMode(m)}
                className={`px-3 py-1 rounded-md transition-colors ${mode===m?'bg-brand-600 text-white':'text-brand-700 hover:bg-brand-50'}`}>{l}</button>
            ))}
          </div>
        </div>
        {rows.map(({key,label,color,amt,pct})=>(
          <div key={key} className="flex items-center gap-3">
            <div className="w-32">
              <Input label={byAmt?`${label} (₹)`:`${label} (%)`} type="number" step="any" min={0}
                value={f[key]} onChange={e=>s(key,e.target.value)}/>
            </div>
            <div className="flex-1"><ProgressBar value={pct} max={100} color={color} showLabel/></div>
            <span className="text-sm font-medium text-content w-28 text-right">
              {byAmt ? `${pct.toFixed(1)}%` : formatCurrency(amt)}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-3 pt-2 border-t border-brand-100">
          <div className="w-32"><p className="text-xs text-muted">Savings (rest)</p>
            <p className={`text-lg font-bold ${savingsAmt<0?'text-red-600':'text-green-600'}`}>{formatCurrency(savingsAmt)}</p></div>
          <div className="flex-1"><ProgressBar value={Math.max(0,savingsPct)} max={100} color="green" showLabel/></div>
          <span className="text-sm font-semibold text-green-700 w-28 text-right">{savingsPct.toFixed(1)}%</span>
        </div>
        <p className="text-xs text-muted">Savings = salary − recurring − personal − investment. Switch between ₹ and % anytime — the other is filled in automatically.</p>
      </div>

      <Textarea label="Notes" value={f.notes} onChange={e=>s('notes',e.target.value)} rows={2}/>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">{initial?'Update':'Save'} Allocation</Button>
      </div>
    </form>
  )
}

export default function Salary() {
  const { allocations, loading, fetchAll, create, update, delete:del } = useSalaryStore()
  const [modal, setModal] = useState({ open:false, item:null })

  useEffect(()=>{ fetchAll() },[])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-content">Salary Allocations</h2>
          <p className="text-sm text-muted">Manage monthly budget using the 50-30-20 rule</p></div>
        <Button onClick={()=>setModal({open:true,item:null})}><Plus size={16}/> Add Allocation</Button>
      </div>

      {loading ? <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>
      : allocations.length===0 ? (
        <Card><CardContent className="text-center py-16">
          <IndianRupee size={40} className="mx-auto text-faint mb-3"/>
          <p className="text-muted mb-4">No salary allocations yet</p>
          <Button onClick={()=>setModal({open:true,item:null})}><Plus size={16}/> Add First</Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {allocations.map(sa=>(
            <Card key={sa.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-content text-lg">{MONTHS[sa.month-1]} {sa.year}</h3>
                    <p className="text-2xl font-bold text-brand-600">{formatCurrency(sa.total_salary)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={()=>setModal({open:true,item:sa})}><Pencil size={14}/></Button>
                    <Button size="sm" variant="danger" onClick={()=>del(sa.id)}><Trash2 size={14}/></Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    {label:'Recurring', budget:sa.needs_amount, spent:sa.totalNeedsSpent, pct:sa.needs_percentage, color:'blue', track:true},
                    {label:'Personal', budget:sa.wants_amount, spent:sa.totalWantsSpent, pct:sa.wants_percentage, color:'orange', track:true},
                    {label:'Investment', budget:sa.investment_amount, spent:0, pct:sa.investment_percentage, color:'purple', track:false},
                    {label:'Savings', budget:sa.savings_amount, spent:0, pct:sa.savings_percentage, color:'green', track:false},
                  ].map(({label,budget,spent,pct,color,track})=>{
                    const left = Number(budget||0) - Number(spent||0)
                    const exhausted = track && Number(budget||0) > 0 && left <= 0
                    return (
                    <div key={label} className={`rounded-xl p-3 ${exhausted?'bg-red-50 ring-1 ring-red-200':'bg-surface-2'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-content">{label} ({pct||0}%)</span>
                        {exhausted ? <Badge variant="danger">Exhausted</Badge> : <span className="text-xs text-muted">{formatCurrency(budget)}</span>}
                      </div>
                      {track ? (
                        <>
                          <ProgressBar value={Number(spent||0)} max={Number(budget||1)} color={exhausted?'red':color} showLabel/>
                          <div className="flex justify-between mt-1 text-xs text-muted">
                            <span>Spent: {formatCurrency(spent)}</span>
                            <span className={exhausted?'text-red-600 font-semibold':''}>{exhausted?`Over ${formatCurrency(-left)}`:`Left: ${formatCurrency(left)}`}</span>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-faint mt-1">{label==='Investment'?'Set aside for investing':'Set aside as savings'}</p>
                      )}
                    </div>
                  )})}
                </div>
                {sa.notes && <p className="text-sm text-muted mt-3 italic">📝 {sa.notes}</p>}
                <div className="mt-2"><UpdatedAt at={sa.updated_at}/></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modal.open} onClose={()=>setModal({open:false,item:null})}
        title={modal.item?'Edit Salary Allocation':'New Salary Allocation'} size="lg">
        <SalaryForm
          initial={modal.item}
          onSave={async(data)=>{ if(modal.item) await update(modal.item.id,data); else await create(data) }}
          onClose={()=>setModal({open:false,item:null})}
        />
      </Modal>
    </div>
  )
}
