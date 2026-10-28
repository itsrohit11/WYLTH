import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, Pin, PinOff, Search, StickyNote, CalendarDays } from 'lucide-react'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input, Select, Textarea } from '../components/ui/Input'
import { UpdatedAt } from '../components/ui/UpdatedAt'
import { fmtDate, fmtDateTime, localToday } from '../lib/utils'

// Tag -> label + soft colour classes (kept literal so Tailwind picks them up).
const TAGS = {
  GENERAL:  { label: 'General',  cls: 'bg-slate-100 text-slate-700',    bar: 'from-slate-400 to-slate-500' },
  IDEA:     { label: 'Money idea', cls: 'bg-amber-100 text-amber-800',  bar: 'from-amber-400 to-orange-500' },
  GOAL:     { label: 'Goal',     cls: 'bg-emerald-100 text-emerald-800', bar: 'from-emerald-400 to-teal-500' },
  REMINDER: { label: 'Reminder', cls: 'bg-rose-100 text-rose-800',      bar: 'from-rose-400 to-pink-500' },
  TAX:      { label: 'Tax',      cls: 'bg-sky-100 text-sky-800',        bar: 'from-sky-400 to-blue-500' },
  INVEST:   { label: 'Investing', cls: 'bg-violet-100 text-violet-800', bar: 'from-violet-400 to-purple-500' },
}

function NoteForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial
    ? { title: initial.title || '', body: initial.body || '', tag: initial.tag || 'GENERAL', note_date: initial.note_date || localToday(), pinned: !!initial.pinned }
    : { title: '', body: '', tag: 'GENERAL', note_date: localToday(), pinned: false })
  const s = (k, v) => setF(p => ({ ...p, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    if (!f.title.trim() && !f.body.trim()) { toast.error('Write something first'); return }
    await onSave(f); onClose()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Input label="Title" value={f.title} onChange={e => s('title', e.target.value)} placeholder="e.g. Plan for Diwali bonus" autoFocus />
      <Textarea label="Note" value={f.body} onChange={e => s('body', e.target.value)} rows={8} placeholder="Type anything about your money — plans, numbers, things to remember…" />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Type" value={f.tag} onChange={e => s('tag', e.target.value)}>
          {Object.entries(TAGS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Input label="Date" type="date" value={f.note_date} onChange={e => s('note_date', e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm text-content cursor-pointer">
        <input type="checkbox" checked={f.pinned} onChange={e => s('pinned', e.target.checked)} className="w-4 h-4 accent-brand-600 rounded" />
        Pin to top
      </label>
      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">{initial ? 'Save changes' : 'Save note'}</Button>
      </div>
    </form>
  )
}

export default function Notes() {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState({ open: false, item: null })
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('ALL')

  const load = () => window.api.note.getAll().then(setNotes).catch(() => setNotes([])).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const save = async (d) => {
    if (modal.item) { await window.api.note.update(modal.item.id, d); toast.success('Note updated') }
    else { await window.api.note.create(d); toast.success('Note saved') }
    load()
  }
  const del = async (n) => {
    if (!window.confirm(`Delete "${n.title || 'this note'}"? This can't be undone.`)) return
    await window.api.note.delete(n.id); toast.success('Note deleted'); load()
  }
  const pin = async (n) => { await window.api.note.pin(n.id, !n.pinned); load() }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return notes.filter(n => (tag === 'ALL' || n.tag === tag) &&
      (!needle || `${n.title || ''} ${n.body || ''}`.toLowerCase().includes(needle)))
  }, [notes, q, tag])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-content">Notes</h2>
          <p className="text-sm text-muted">Jot down anything about your money — every note is dated automatically.</p>
        </div>
        <Button onClick={() => setModal({ open: true, item: null })}><Plus size={16} /> New note</Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search notes…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-line bg-surface text-content focus:outline-none focus:border-brand-500 focus:shadow-focus" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[['ALL', 'All'], ...Object.entries(TAGS).map(([k, v]) => [k, v.label])].map(([k, l]) => (
            <button key={k} onClick={() => setTag(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${tag === k ? 'bg-brand-600 text-white shadow-soft' : 'bg-surface-2 text-muted hover:text-content'}`}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      ) : shown.length === 0 ? (
        <Card><CardContent className="text-center py-16">
          <StickyNote size={44} className="mx-auto text-faint mb-3" />
          <p className="text-muted mb-4">{notes.length ? 'No notes match your search.' : 'No notes yet — write your first one.'}</p>
          {!notes.length && <Button onClick={() => setModal({ open: true, item: null })}><Plus size={16} /> New note</Button>}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map(n => {
            const t = TAGS[n.tag] || TAGS.GENERAL
            return (
              <Card key={n.id} className="overflow-hidden flex flex-col">
                <div className={`h-1.5 bg-gradient-to-r ${t.bar}`} />
                <CardContent className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-content truncate">{n.title || 'Untitled note'}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.cls}`}>{t.label}</span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted"><CalendarDays size={11} />{fmtDate(n.note_date)}</span>
                      </div>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => pin(n)} title={n.pinned ? 'Unpin' : 'Pin to top'}>
                        {n.pinned ? <Pin size={14} className="text-brand-600 fill-brand-600" /> : <PinOff size={14} className="text-faint" />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setModal({ open: true, item: n })}><Pencil size={14} className="text-muted" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => del(n)}><Trash2 size={14} className="text-red-400" /></Button>
                    </div>
                  </div>
                  <p className="text-sm text-content/90 whitespace-pre-wrap break-words flex-1">{n.body}</p>
                  <div className="mt-3 pt-3 border-t border-line/60 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-faint" title={fmtDateTime(n.created_at)}>Created {fmtDateTime(n.created_at)}</span>
                    {n.updated_at !== n.created_at && <UpdatedAt at={n.updated_at} label="Edited" />}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? 'Edit note' : 'New note'}>
        <NoteForm initial={modal.item} onSave={save} onClose={() => setModal({ open: false, item: null })} />
      </Modal>
    </div>
  )
}
