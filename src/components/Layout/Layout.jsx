import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import CommandPalette from '../CommandPalette'

export default function Layout() {
  // Feeds the card spotlight: remember where the pointer is inside whichever card it is over.
  useEffect(() => {
    const move = (e) => {
      const card = e.target.closest?.('.card-surface')
      if (!card) return
      const r = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${e.clientX - r.left}px`)
      card.style.setProperty('--my', `${e.clientY - r.top}px`)
    }
    document.addEventListener('mousemove', move, { passive: true })
    return () => document.removeEventListener('mousemove', move)
  }, [])
  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      <Sidebar/>
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header/>
        <main className="flex-1 overflow-y-auto px-8 pb-10 pt-2">
          <div className="mx-auto max-w-7xl fade-in">
            <Outlet/>
          </div>
        </main>
      </div>
      <CommandPalette/>
    </div>
  )
}
