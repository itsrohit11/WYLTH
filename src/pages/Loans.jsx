import { useEffect, useState } from 'react'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input, Select, Textarea } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { formatCurrency, netLoanTotals } from '../lib/utils'
import { Plus, Pencil, Trash2, Coins, Check, RotateCcw, ChevronDown, Lock, Unlock } from 'lucide-react'
import toast from 'react-hot-toast'
import { UpdatedAt } from '../components/ui/UpdatedAt'

const todayStr = () => new Date().toISOString().split('T')[0]

function LoanForm({ initial, presetPerson, onSave, onClose }) {
  const [f, setF] = useState(initial ? {
    kind:initial.kind, person:initial.person, amount:initial.amount, date:initial.date,
    return_date:initial.return_date||'', reason:initial.reason||'', notes:initial.notes||''
  } : { kind:'LEND', person:presetPerson||'', amount:'', date:todayStr(), return_date:'', reason:'', notes:'' })
  const s=(k,v)=>setF(p=>({...p,[k]:v}))
  const lent = f.kind === 'LEND'
  const submit=async(e)=>{ e.preventDefault(); await onSave(f); onClose() }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-3">
        {[['LEND','I lent money (to receive)'],['DEBT','I borrowed (to repay)']].map(([k,label])=>(
          <button key={k} type="button" onClick={()=>s('kind',k)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${f.kind===k
              ? k==='LEND' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'
              : 'border-line text-muted hover:bg-surface-2'}`}>{label}</button>
        ))}
      </div>
      <Input label={lent ? 'Lent to (name)' : 'Borrowed from (name)'} value={f.person} onChange={e=>s('person',e.target.value)} required/>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Amount (₹)" type="number" step="any" value={f.amount} onChange={e=>s('amount',e.target.value)} required/>
        <Input label={lent ? 'Date of lending' : 'Date taken'} type="date" value={f.date} onChange={e=>s('date',e.target.value)} required/>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Expected return date" type="date" value={f.return_date} onChange={e=>s('return_date',e.target.value)}/>
        <Input label="Reason" value={f.reason} onChange={e=>s('reason',e.target.value)} placeholder="optional"/>
      </div>
      <Textarea label="Notes" value={f.notes} onChange={e=>s('notes',e.target.value)} rows={2}/>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">{initial?'Update':'Add'} Entry</Button>
      </div>
    </form>
  )
}

// Settling moves real money — ask which bank account it hit.
function SettleForm({ loan, onDone, onClose }) {
  const lent = loan.kind === 'LEND'
  const [accounts, setAccounts] = useState([])
  const [accId, setAccId] = useState('')
  useEffect(()=>{ window.api.bank.getAll().then(a=>{ setAccounts(a); if(a.length) setAccId(String(a[0].id)) }).catch(()=>setAccounts([])) }, [])
  const liveOf = (a) => a.live_balance != null ? Number(a.live_balance) : Number(a.balance)
  const submit=async(e)=>{
    e.preventDefault()
    await window.api.loan.setSettled(loan.id, true, accId ? Number(accId) : null)
    if (accId) {
      const acc = accounts.find(a=>String(a.id)===accId)
      toast.success(lent
        ? `${formatCurrency(loan.amount)} added to ${acc?.name||'account'}`
        : `${formatCurrency(loan.amount)} deducted from ${acc?.name||'account'}`)
    }
    onDone(); onClose()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-content">
        {lent
          ? <>Settling <b>{loan.person}</b>'s repayment of <b>{formatCurrency(loan.amount)}</b> — which account <b>received</b> the money?</>
          : <>Settling your repayment of <b>{formatCurrency(loan.amount)}</b> to <b>{loan.person}</b> — which account did you <b>pay from</b>?</>}
      </p>
      {accounts.length === 0 ? (
        <p className="text-xs text-amber-600">No bank accounts set up — it will just be marked settled without adjusting any balance.</p>
      ) : (
        <Select label={lent ? 'Received in account' : 'Paid from account'} value={accId} onChange={e=>setAccId(e.target.value)}>
          {accounts.map(a=><option key={a.id} value={a.id}>{a.name} — {formatCurrency(liveOf(a))}</option>)}
          <option value="">Don't adjust any account</option>
        </Select>
      )}
      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="success"><Check size={15}/> Mark Settled</Button>
      </div>
    </form>
  )
}

export default function Loans() {
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState({ open:false, item:null, presetPerson:null })
  const [settle, setSettle] = useState({ open:false, loan:null })
  const [expanded, setExpanded] = useState({})

  const load = () => { setLoading(true); window.api.loan.getAll().then(setLoans).catch(()=>{}).finally(()=>setLoading(false)) }
  useEffect(()=>{ load() }, [])

  // Google-Pay style: one card per person, everything netted into a single final figure.
  const { toReceive, toRepay } = netLoanTotals(loans)
  const groups = []
  {
    const byName = {}
    for (const l of loans) {
      const key = (l.person||'').trim().toLowerCase()
      if (!byName[key]) { byName[key] = { key, name:(l.person||'').trim(), items:[] }; groups.push(byName[key]) }
      byName[key].items.push(l)
    }
    for (const g of groups) {
      g.net = g.items.filter(l=>!l.settled).reduce((s,l)=>s+(l.kind==='LEND'?1:-1)*Number(l.amount||0),0)
      g.openCount = g.items.filter(l=>!l.settled).length
    }
  }

  const save = async (d) => { if (modal.item) await window.api.loan.update(modal.item.id, d); else await window.api.loan.create(d); load() }
  const del = async (l) => {
    const settledNote = l.settled ? ' Money already moved when it was settled stays in your bank statement.' : ''
    if (!window.confirm(`Delete this ${l.kind==='LEND'?'lent':'borrowed'} entry of ${formatCurrency(l.amount)} with ${l.person}?${settledNote}`)) return
    const r = await window.api.loan.delete(l.id)
    if (r && r.success === false) toast.error('This entry is locked. Unlock it first.')
    else toast.success('Entry deleted')
    load()
  }
  const delPerson = async (g) => {
    if (!window.confirm(`Delete ${g.name} and all ${g.items.length} entr${g.items.length===1?'y':'ies'}? This can't be undone. Money already moved by settled entries stays in your bank statement.`)) return
    const r = await window.api.loan.deletePerson(g.name)
    if (r.locked) toast(`${r.deleted} deleted. ${r.locked} locked entr${r.locked===1?'y was':'ies were'} kept — unlock to delete.`, { icon: '🔒' })
    else toast.success(`${g.name} removed`)
    load()
  }
  const toggleSettle = async (l) => {
    if (l.settled) { await window.api.loan.setSettled(l.id, false); toast('Un-settled — account adjustment reversed', { icon: '↩️' }); load() }
    else setSettle({ open:true, loan:l })
  }
  const toggleLock = async (l) => { await window.api.loan.setLocked(l.id, !l.locked); load() }
  const toggleOpen = (key) => setExpanded(p=>({ ...p, [key]: !p[key] }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-content">Lending &amp; Debts</h2>
          <p className="text-sm text-muted">Per person, everything nets into one final amount — like GPay</p></div>
        <Button onClick={()=>setModal({open:true,item:null,presetPerson:null})}><Plus size={16}/> Add Entry</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          {label:'To Receive (net)', value:toReceive, cls:'text-green-600'},
          {label:'To Repay (net)', value:toRepay, cls:'text-red-600'},
          {label:'Net', value:toReceive-toRepay, cls:(toReceive-toRepay)>=0?'text-green-600':'text-red-600'},
        ].map(c=>(
          <Card key={c.label}><CardContent className="py-4 text-center">
            <p className={`text-xl font-bold tabular ${c.cls}`}>{formatCurrency(c.value)}</p>
            <p className="text-xs text-muted mt-1">{c.label}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>
          : groups.length===0 ? (
            <div className="text-center py-16 text-faint"><Coins size={40} className="mx-auto mb-3 text-faint"/><p>Nothing here yet</p></div>
          ) : (
            <div className="divide-y divide-line">
              {groups.map(g=>{
                const open = !!expanded[g.key]
                return (
                <div key={g.key}>
                  {/* Person header — click to expand their entries */}
                  <div role="button" tabIndex={0} onClick={()=>toggleOpen(g.key)} onKeyDown={e=>{ if (e.key==='Enter'||e.key===' ') { e.preventDefault(); toggleOpen(g.key) } }} className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors text-left cursor-pointer">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-sm font-bold shrink-0">
                        {(g.name[0]||'?').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-content truncate">{g.name}</p>
                        <p className="text-xs text-faint">{g.items.length} entr{g.items.length===1?'y':'ies'}{g.openCount?` · ${g.openCount} open`:''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {g.net > 0 ? (
                        <div className="text-right"><p className="text-sm font-bold tabular text-green-600">{formatCurrency(g.net)}</p><p className="text-[11px] text-faint">you'll receive</p></div>
                      ) : g.net < 0 ? (
                        <div className="text-right"><p className="text-sm font-bold tabular text-red-600">{formatCurrency(-g.net)}</p><p className="text-[11px] text-faint">you'll pay</p></div>
                      ) : (
                        <p className="text-xs font-semibold text-faint">Settled up</p>
                      )}
                      <button type="button" onClick={e=>{ e.stopPropagation(); delPerson(g) }} title={`Delete ${g.name} and all their entries`}
                        className="p-1.5 rounded-lg text-faint hover:text-red-500 hover:bg-red-500/10 transition-colors"><Trash2 size={15}/></button>
                      <ChevronDown size={16} className={`text-faint transition-transform ${open?'rotate-180':''}`}/>
                    </div>
                  </div>

                  {/* Dropdown: all entries for this person */}
                  {open && (
                    <div className="bg-surface-2/50 border-t border-line/60">
                      {g.items.map(l=>(
                        <div key={l.id} className={`flex items-center justify-between pl-14 pr-4 py-2.5 ${l.settled?'opacity-55':''}`}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={l.kind==='LEND'?'success':'danger'}>{l.kind==='LEND'?'Lent':'Borrowed'}</Badge>
                              <span className="text-xs text-faint">{l.date}{l.return_date?` · return by ${l.return_date}`:''}{l.reason?` · ${l.reason}`:''}</span>
                              {l.settled ? <Badge variant="default">Settled</Badge> : null}
                              {l.locked ? <Badge variant="warning">Locked</Badge> : null}
                              <UpdatedAt at={l.updated_at} icon={false}/>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className={`text-sm font-semibold tabular mr-1 ${l.settled?'text-faint line-through':l.kind==='LEND'?'text-green-600':'text-red-600'}`}>
                              {l.kind==='LEND'?'+':'−'}{formatCurrency(l.amount)}
                            </span>
                            {l.locked ? (
                              <Button size="icon" variant="ghost" onClick={()=>toggleLock(l)} title="Locked — click to unlock and allow changes"><Lock size={14} className="text-amber-600"/></Button>
                            ) : (
                              <>
                                <Button size="icon" variant="ghost" onClick={()=>toggleSettle(l)} title={l.settled?'Mark unsettled':'Mark settled'}>{l.settled?<RotateCcw size={14} className="text-faint"/>:<Check size={15} className="text-green-600"/>}</Button>
                                <Button size="icon" variant="ghost" onClick={()=>setModal({open:true,item:l,presetPerson:null})} title="Edit"><Pencil size={13} className="text-muted"/></Button>
                                <Button size="icon" variant="ghost" onClick={()=>del(l)} title="Delete this entry"><Trash2 size={13} className="text-red-400"/></Button>
                                <Button size="icon" variant="ghost" onClick={()=>toggleLock(l)} title="Lock (prevent further changes)"><Unlock size={13} className="text-faint"/></Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="pl-14 pr-4 py-2 border-t border-line/50">
                        <button onClick={()=>setModal({open:true,item:null,presetPerson:g.name})} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                          <Plus size={12}/> Add lend / debt with {g.name}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={modal.open} onClose={()=>setModal({open:false,item:null,presetPerson:null})} title={modal.item?'Edit Entry':'Add Lending / Debt'}>
        <LoanForm initial={modal.item} presetPerson={modal.presetPerson} onSave={save} onClose={()=>setModal({open:false,item:null,presetPerson:null})}/>
      </Modal>
      <Modal open={settle.open} onClose={()=>setSettle({open:false,loan:null})} title="Settle" size="sm">
        {settle.loan && <SettleForm loan={settle.loan} onDone={load} onClose={()=>setSettle({open:false,loan:null})}/>}
      </Modal>
    </div>
  )
}
