import React, { useEffect } from 'react'

export default function ScrollProbe({ targetSelector = 'main' }) {
  useEffect(() => {
    const el = document.querySelector(targetSelector)
    if (!el) {
      console.warn('[ScrollProbe] target not found:', targetSelector)
      return
    }
    const onScroll = () => {
      console.log('[ScrollProbe] scrollTop=', el.scrollTop, 'height=', el.scrollHeight, 'client=', el.clientHeight)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    console.log('[ScrollProbe] attached to', targetSelector, { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight })
    return () => el.removeEventListener('scroll', onScroll)
  }, [targetSelector])

  const scrollToBottom = () => {
    const el = document.querySelector(targetSelector)
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  return (
    <div className="fixed right-2 bottom-20 z-50 rounded-lg bg-black/70 text-white text-xs px-2 py-1 shadow">
      <button onClick={scrollToBottom}>Scroll ↓</button>
    </div>
  )
}
