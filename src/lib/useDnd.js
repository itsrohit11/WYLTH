import { useState } from 'react'

// Lightweight HTML5 drag-to-reorder (no external deps).
// `items` = current array, `onReorder(newItems)` is called with the reordered array.
// Returns `itemProps(index)` to spread onto each list element.
export function useDnd(items, onReorder) {
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)

  const itemProps = (idx) => ({
    draggable: true,
    onDragStart: (e) => { setDragIdx(idx); e.dataTransfer.effectAllowed = 'move' },
    onDragOver: (e) => { e.preventDefault(); if (idx !== overIdx) setOverIdx(idx) },
    onDrop: (e) => {
      e.preventDefault()
      if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setOverIdx(null); return }
      const arr = items.slice()
      const [moved] = arr.splice(dragIdx, 1)
      arr.splice(idx, 0, moved)
      setDragIdx(null); setOverIdx(null)
      onReorder(arr)
    },
    onDragEnd: () => { setDragIdx(null); setOverIdx(null) },
    style: overIdx === idx && dragIdx !== idx ? { boxShadow: 'inset 0 0 0 2px #93c5fd' } : (dragIdx === idx ? { opacity: 0.5 } : undefined),
  })

  return { itemProps }
}
