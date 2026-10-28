import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

const sizes = { sm:'max-w-sm', default:'max-w-lg', lg:'max-w-2xl', xl:'max-w-4xl' }

export function Modal({ open, onClose, title, children, size='default' }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#020611]/70 backdrop-blur-sm animate-overlay-in" onClick={onClose}/>
      <div className={cn('relative card-surface !backdrop-blur-xl shadow-lift w-full z-10 animate-scale-in max-h-[90vh] flex flex-col !rounded-[26px]', sizes[size])}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-line">
            <h2 className="text-lg font-semibold text-content tracking-tight">{title}</h2>
            <button onClick={onClose} className="p-1.5 text-faint hover:text-content hover:bg-surface-2 rounded-lg transition-all"><X size={16}/></button>
          </div>
        )}
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
