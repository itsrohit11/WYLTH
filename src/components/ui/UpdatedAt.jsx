import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { timeAgo, fmtDateTime, parseDbTime } from '../../lib/utils'

// "Updated 5 min ago" with the exact date & time on hover. Re-renders every minute so the
// relative wording stays fresh. Renders nothing when there is no timestamp.
export function UpdatedAt({ at, label = 'Updated', icon = true, className = '' }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(t) }, [])
  if (!parseDbTime(at)) return null
  return (
    <span title={fmtDateTime(at)} className={`inline-flex items-center gap-1 text-[11px] text-faint ${className}`}>
      {icon && <Clock size={10} />}{label} {timeAgo(at)}
    </span>
  )
}
