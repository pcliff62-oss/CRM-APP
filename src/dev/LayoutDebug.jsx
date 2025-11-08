import React, { useEffect } from 'react'

export default function LayoutDebug() {
  useEffect(() => {
    const root = document.querySelector('#root')
    console.log('[LayoutDebug]', {
      rootHeight: root?.offsetHeight,
      bodyHeight: document.body.offsetHeight,
      htmlHeight: document.documentElement.offsetHeight,
      windowInnerHeight: window.innerHeight,
    })
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      <div className="absolute top-0 left-0 right-0 h-8 bg-red-500/20 text-[10px] text-center text-red-700">header zone</div>
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-blue-500/20 text-[10px] text-center text-blue-700">footer zone</div>
      <div className="absolute inset-y-8 bottom-12 left-0 right-0 bg-green-500/10 text-[10px] text-center text-green-700">main scroll zone</div>
    </div>
  )
}
