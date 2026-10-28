import { useState, useEffect, useCallback } from 'react'

export function currentTheme() {
  try { return localStorage.getItem('theme-v4') === 'light' ? 'light' : 'dark' } catch { return 'dark' }
}

export function setTheme(t) {
  const dark = t === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  try { localStorage.setItem('theme-v4', t) } catch {}
  window.dispatchEvent(new Event('themechange'))
}

// Keep the DOM class in sync with the saved preference on first load.
setTheme(currentTheme())

export function useTheme() {
  const [theme, setT] = useState(currentTheme())
  useEffect(() => {
    const h = () => setT(currentTheme())
    window.addEventListener('themechange', h)
    return () => window.removeEventListener('themechange', h)
  }, [])
  const toggle = useCallback(() => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'), [])
  return { theme, toggle, setTheme }
}

// Colours for recharts (which takes plain strings, not CSS classes) per theme.
export function useChartTheme() {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  return {
    grid: dark ? '#223566' : '#E4DECE',
    axis: dark ? '#9AA8C7' : '#55675F',
    tooltip: dark
      ? { background: '#0E1730', border: '1px solid #223566', borderRadius: '12px', color: '#EEF2FB' }
      : { background: '#FFFDF8', border: '1px solid #DDD7C7', borderRadius: '12px', color: '#060B18' },
  }
}
