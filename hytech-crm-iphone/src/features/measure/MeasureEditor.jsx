import React, { useEffect, useRef, useState } from 'react'
import { recomputeMeasurement } from '../../lib/api.js'

// Simple mobile measurement editor with crosshair and drop-point button.
// Expects props: { measurementId, imageSrc, initialFeatures }
export default function MeasureEditor({ measurementId, imageSrc, initialFeatures = [], gsdMPerPx = null, onBack }) {
  const canvasRef = useRef(null)
  const [img, setImg] = useState(null)
  const [features, setFeatures] = useState(()=> initialFeatures.map(f => ({ ...f })))
  const [activeRing, setActiveRing] = useState([]) // working polygon ring [[x,y],...]
  const [polygons, setPolygons] = useState(()=> features.filter(f=>f?.geometry?.type==='Polygon').map(f=>f.geometry.coordinates?.[0] || []))
  const [saving, setSaving] = useState(false)
  const wrapRef = useRef(null)
  const [view, setView] = useState({ x: 0, y: 0, w: 0, h: 0 }) // viewBox over image pixels
  const viewRef = useRef({ x: 0, y: 0, w: 0, h: 0 })
  const [angle, setAngle] = useState(0)
  const [lockRotation, setLockRotation] = useState(false)
  const [lockZoom, setLockZoom] = useState(false)
  const lockRotationRef = useRef(false)
  const lockZoomRef = useRef(false)
  const [pitchByPoly, setPitchByPoly] = useState({}) // { polyIndex: pitchIn12 }
  // Modes & Layers
  const [mode, setMode] = useState('draw') // 'draw' | 'label' | 'pitch'
  const [layers, setLayers] = useState(() => [{ id: 'L1', name: 'Layer 1' }])
  const [activeLayerId, setActiveLayerId] = useState('L1')
  const [layerByPoly, setLayerByPoly] = useState({}) // { polyIndex: layerId }
  const [edgesByPoly, setEdgesByPoly] = useState({}) // { polyIndex: Array<'unknown'|'eave'|'rake'|'ridge'|'hip'|'valley'> }
  const [selectedPolyIndex, setSelectedPolyIndex] = useState(null)
  // Pitch editing: global current pitch value used for assignments in pitch mode
  const [currentPitch, setCurrentPitch] = useState(6)
  // Label palette
  const LABEL_TYPES = [
    { key: 'eave', name: 'Eave', color: 'rgb(45, 212, 191)' },
    { key: 'rake', name: 'Rake', color: 'rgb(96, 165, 250)' },
    { key: 'ridge', name: 'Ridge', color: 'rgb(249, 115, 22)' },
    { key: 'valley', name: 'Valley', color: 'rgb(244, 63, 94)' },
    { key: 'hip', name: 'Hip', color: 'rgb(167, 139, 250)' },
    { key: 'flashing', name: 'Flashing', color: 'rgb(245, 158, 11)' },
    { key: 'parapet', name: 'Parapet', color: 'rgb(16, 185, 129)' },
    { key: 'transition', name: 'Transition', color: 'rgb(236, 72, 153)' },
    { key: 'unknown', name: 'Unknown', color: 'rgb(156, 163, 175)' },
  ]
  const labelColor = (type, alpha = 0.95) => {
    const t = LABEL_TYPES.find(l => l.key === type) || LABEL_TYPES.find(l => l.key === 'unknown')
    if (!t) return `rgba(156,163,175,${alpha})`
    return t.color.replace('rgb', 'rgba').replace(')', `,${alpha})`)
  }
  const [activeLabelType, setActiveLabelType] = useState('unknown')
  const activeLabelTypeRef = useRef('unknown')
  useEffect(()=> { activeLabelTypeRef.current = activeLabelType }, [activeLabelType])
  const dragRef = useRef(null)
  const pinchRef = useRef({ dist: 0, start: null })
  const initialScaleRef = useRef(1)
  const longPressTimerRef = useRef(null)
  const longPressStartRef = useRef({ x: 0, y: 0 })
  const lastPosRef = useRef({ x: 0, y: 0 })
  const snapRef = useRef({ active: false, x: 0, y: 0 }) // canvas-space snapped center when guides intersect
  const lastGuideRef = useRef({ x: null, y: null }) // remember last snapped axes for sticky feel

  // Keep lock refs in sync with state so event handlers (wheel/touch) read latest values
  useEffect(() => {
    lockRotationRef.current = lockRotation
    lockZoomRef.current = lockZoom
  }, [lockRotation, lockZoom])

  // Load background image
  useEffect(() => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => setImg(i)
    i.src = imageSrc
  }, [imageSrc])

  // Draw canvas when image, geometry, view, or angle changes
  useEffect(() => {
  // keep refs in sync to avoid stale closures
  viewRef.current = view
  lockRotationRef.current = lockRotation
  lockZoomRef.current = lockZoom
    const cvs = canvasRef.current
    if (!cvs || !img) return
    const ctx = cvs.getContext('2d')
  // Fit canvas to wrapper, but draw from image via a viewBox with rotation
  const wrap = wrapRef.current
  const targetW = wrap ? wrap.clientWidth : img.width
  const targetH = wrap ? wrap.clientHeight : img.height
  cvs.width = Math.max(1, targetW)
  cvs.height = Math.max(1, targetH)
    ctx.clearRect(0,0,cvs.width,cvs.height)
  // Establish view if not set yet (fit image)
  if (!view.w || !view.h) {
    setView({ x: 0, y: 0, w: img.width, h: img.height })
    initialScaleRef.current = 1 // full-image view => scale 1
  }
  // Use effective view (fallback to full image before state applies)
  const v = (view.w && view.h) ? view : { x: 0, y: 0, w: img.width, h: img.height }
  // Draw rotated image fitting current view
  const scaleX = cvs.width / (v.w || img.width)
  const scaleY = cvs.height / (v.h || img.height)
  ctx.save()
  // Map view to canvas coords then rotate around canvas center
  ctx.translate(cvs.width/2, cvs.height/2)
  ctx.rotate(angle * Math.PI/180)
  ctx.scale(scaleX, scaleY)
  ctx.translate(-v.w/2, -v.h/2)
  ctx.drawImage(img, v.x, v.y, v.w, v.h, 0, 0, v.w, v.h)
  ctx.restore()
    // Screen-space grid (non-rotating overlay)
    {
      const spacing = 24 // px (closer together)
      ctx.save()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'
      // Vertical lines
      for (let x = 0.5; x <= cvs.width; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cvs.height); ctx.stroke()
      }
      // Horizontal lines
      for (let y = 0.5; y <= cvs.height; y += spacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cvs.width, y); ctx.stroke()
      }
      ctx.restore()
    }
    // Draw existing polygons (dim non-active layer) with edge colors mapped to labels
    polygons.forEach((ring, polyIdx) => {
      if (!ring || ring.length === 0) return
      ctx.save()
      const isActiveLayer = (layerByPoly[polyIdx] || 'L1') === activeLayerId
      ctx.lineWidth = 2
      ctx.fillStyle = isActiveLayer ? 'rgba(0,200,255,0.2)' : 'rgba(0,200,255,0.08)'
      // Transform image coords to canvas coords given view+rotation
      ctx.beginPath()
      ring.forEach(([x,y], idx)=> {
        const p = worldToCanvas(x,y,cvs.width,cvs.height)
        if (idx===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y)
      })
      ctx.closePath()
      ctx.fill()
      // Edge strokes using label colors (always visible, dim if not active layer)
      for (let i=0;i<ring.length;i++) {
        const a = ring[i]
        const b = ring[(i+1)%ring.length]
        const pa = worldToCanvas(a[0], a[1], cvs.width, cvs.height)
        const pb = worldToCanvas(b[0], b[1], cvs.width, cvs.height)
        const et = (edgesByPoly[polyIdx]?.[i]) || 'unknown'
        const col = labelColor(et, isActiveLayer ? 0.95 : 0.45)
        ctx.strokeStyle = col
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke()
      }
      // Vertex markers
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.strokeStyle = 'rgba(2,132,199,0.9)'
      for (const [x,y] of ring) {
        const p = worldToCanvas(x,y,cvs.width,cvs.height)
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill(); ctx.stroke()
      }
  // Edge labels (lengths) in label mode only
  if (mode === 'label' && ring.length > 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.font = '12px system-ui, -apple-system, sans-serif'
        for (let i=0;i<ring.length;i++) {
          const a = ring[i]
          const b = ring[(i+1)%ring.length]
          const pa = worldToCanvas(a[0], a[1], cvs.width, cvs.height)
          const pb = worldToCanvas(b[0], b[1], cvs.width, cvs.height)
          const midx = (pa.x + pb.x)/2
          const midy = (pa.y + pb.y)/2
          const dx = b[0]-a[0], dy = b[1]-a[1]
          const px = Math.hypot(dx, dy)
          // Convert px to feet: gsdMPerPx -> meters; * 3.28084 => feet
          const ft = gsdMPerPx ? (px * gsdMPerPx * 3.28084) : null
          if (ft) {
            const type = (edgesByPoly[polyIdx]?.[i]) || 'unknown'
            const label = `${ft.toFixed(1)} ft${type !== 'unknown' ? ` • ${type}` : ''}`
    ctx.fillText(label, midx+4, midy-4)
          }
        }
      }
      // Pitch label for polygon (only in pitch mode)
      if (mode === 'pitch') {
        const pitch = pitchByPoly[polyIdx] ?? 6
        const c0 = ring[0]
        if (c0) {
          const p0 = worldToCanvas(c0[0], c0[1], cvs.width, cvs.height)
          ctx.fillStyle = 'rgba(0,0,0,0.8)'
          ctx.fillText(`${pitch}/12`, p0.x+6, p0.y-6)
        }
      }
      ctx.restore()
    })
  // Draw active ring
    if (activeRing.length) {
      ctx.strokeStyle = 'rgba(255,180,0,0.9)'
      ctx.fillStyle = 'rgba(255,180,0,0.2)'
      ctx.beginPath()
      activeRing.forEach(([x,y], idx)=> {
        const p = worldToCanvas(x,y,cvs.width,cvs.height)
        if (idx===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y)
      })
      ctx.stroke()
      // Active vertex markers
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.strokeStyle = 'rgba(234,88,12,0.9)'
      for (const [x,y] of activeRing) {
        const p = worldToCanvas(x,y,cvs.width,cvs.height)
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill(); ctx.stroke()
      }
    }
  // Crosshair + snapping (draw mode): long lines shift to nearest vertex axis when within tolerance.
  const cx = cvs.width/2, cy = cvs.height/2
  ctx.lineWidth = 1
  const tol = 12 // px tolerance for axis snap (slightly less aggressive)
  let guideX = null
  let guideY = null
  let colorGuideX = false // vertical line color flag (x alignment found this frame)
  let colorGuideY = false // horizontal line color flag (y alignment found this frame)
  if (mode === 'draw') {
    let bestDx = Infinity, bestDy = Infinity
  const ringsForAlign = []
    if (activeRing && activeRing.length) ringsForAlign.push(activeRing)
    if (polygons && polygons.length) ringsForAlign.push(...polygons)
    for (const ring of ringsForAlign) {
      for (const [vx, vy] of ring) {
        const pc = worldToCanvas(vx, vy, cvs.width, cvs.height)
        const dx = Math.abs(pc.x - cx)
        const dy = Math.abs(pc.y - cy)
        if (dx <= tol && dx < bestDx) { bestDx = dx; guideX = Math.round(pc.x) + 0.5; colorGuideX = true }
        if (dy <= tol && dy < bestDy) { bestDy = dy; guideY = Math.round(pc.y) + 0.5; colorGuideY = true }
      }
    }
    // Sticky snap: if nothing new found this frame, keep last snapped axis within a looser window
  const stickyTol = tol * 1.2
    if (guideX === null && lastGuideRef.current.x != null && Math.abs((lastGuideRef.current.x) - (cx + 0.5)) <= stickyTol) {
      guideX = lastGuideRef.current.x
    }
    if (guideY === null && lastGuideRef.current.y != null && Math.abs((lastGuideRef.current.y) - (cy + 0.5)) <= stickyTol) {
      guideY = lastGuideRef.current.y
    }
  }
  const drawX = guideX !== null ? guideX : (cx + 0.5)
  const drawY = guideY !== null ? guideY : (cy + 0.5)
  const snapped = guideX !== null || guideY !== null
  // Persist snapped position for drop logic (only matters in draw mode)
  snapRef.current = snapped && mode === 'draw'
    ? { active: true, x: drawX, y: drawY }
    : { active: false, x: cx + 0.5, y: cy + 0.5 }
  // Remember last snapped axes for stickiness
  lastGuideRef.current = { x: guideX, y: guideY }
  // Draw crosshair lines; turn green only when truly aligned this frame on that axis
  // Horizontal line
  ctx.strokeStyle = colorGuideY ? 'rgba(16,185,129,0.95)' : 'rgba(255,255,255,0.9)'
  ctx.beginPath(); ctx.moveTo(0, drawY); ctx.lineTo(cvs.width, drawY); ctx.stroke()
  // Vertical line
  ctx.strokeStyle = colorGuideX ? 'rgba(16,185,129,0.95)' : 'rgba(255,255,255,0.9)'
  ctx.beginPath(); ctx.moveTo(drawX, 0); ctx.lineTo(drawX, cvs.height); ctx.stroke()
  // In non-draw modes keep center crosshair (white) if not snapped
  if (mode !== 'draw') {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.beginPath(); ctx.moveTo(0, cy + 0.5); ctx.lineTo(cvs.width, cy + 0.5); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx + 0.5, 0); ctx.lineTo(cx + 0.5, cvs.height); ctx.stroke()
  }
  }, [img, polygons, activeRing, view, angle])

  // Convert world(image) -> canvas(screen) with current view+angle
  function worldToCanvas(x, y, cw, ch) {
  const v = (view.w && view.h && img) ? view : (img ? { x:0, y:0, w: img.width, h: img.height } : view)
    // view window translates (x,y) into view space, then scale to canvas, then rotate around center
  const sx = ((x - (v.x||0)) / (v.w || 1)) * cw
  const sy = ((y - (v.y||0)) / (v.h || 1)) * ch
    // rotate about center
    const cx = cw/2, cy = ch/2
    const dx = sx - cx, dy = sy - cy
    const a = angle * Math.PI/180
    const rx = dx * Math.cos(a) - dy * Math.sin(a)
    const ry = dx * Math.sin(a) + dy * Math.cos(a)
    return { x: cx + rx, y: cy + ry }
  }

  // Convert canvas(screen) center back to world(image) for dropping points
  function canvasCenterToWorld(cw, ch) {
  // The canvas center corresponds to the center of the current view regardless of rotation
  const v = (view.w && view.h && img) ? view : (img ? { x:0, y:0, w: img.width, h: img.height } : view)
  const x = (v.x || 0) + (v.w || 0) / 2
  const y = (v.y || 0) + (v.h || 0) / 2
  return { x, y }
  }

  // Convert arbitrary canvas point -> world(image) coords
  function canvasToWorld(x, y, cw, ch) {
    const v = (view.w && view.h && img) ? view : (img ? { x:0, y:0, w: img.width, h: img.height } : view)
    const cx = cw/2, cy = ch/2
    // inverse rotate
    const dx = x - cx, dy = y - cy
    const a = -angle * Math.PI/180
    const rx = dx * Math.cos(a) - dy * Math.sin(a)
    const ry = dx * Math.sin(a) + dy * Math.cos(a)
    // inverse scale
    const scaleX = cw / (v.w || 1)
    const scaleY = ch / (v.h || 1)
    const sx = rx / (scaleX || 1)
    const sy = ry / (scaleY || 1)
    // translate into view box
    const ux = (v.w || 0)/2 + sx
    const uy = (v.h || 0)/2 + sy
    return { x: (v.x || 0) + ux, y: (v.y || 0) + uy }
  }

  function pointInRing(px, py, ring) {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1]
      const xj = ring[j][0], yj = ring[j][1]
      const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi)
      if (intersect) inside = !inside
    }
    return inside
  }

  function scheduleLongPress(x, y, cvs) {
    lastPosRef.current = { x, y }
    longPressStartRef.current = { x, y }
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = setTimeout(() => {
      try {
        const p = canvasToWorld(lastPosRef.current.x, lastPosRef.current.y, cvs.width, cvs.height)
        let hitIdx = -1
        for (let i = 0; i < polygons.length; i++) {
          const ring = polygons[i]
          if (ring && ring.length >= 3 && pointInRing(p.x, p.y, ring)) { hitIdx = i; break }
        }
        if (hitIdx >= 0 && mode === 'draw') {
          const ok = window.confirm('Delete this polygon?')
          if (ok) {
            setPolygons(prev => prev.filter((_, i) => i !== hitIdx))
            setPitchByPoly(prev => {
              const next = {}
              Object.keys(prev).forEach((key) => {
                const idx = Number(key)
                if (Number.isFinite(idx)) {
                  if (idx < hitIdx) next[idx] = prev[idx]
                  else if (idx > hitIdx) next[idx - 1] = prev[idx]
                }
              })
              return next
            })
            setEdgesByPoly(prev => {
              const next = {}
              Object.keys(prev).forEach((key) => {
                const idx = Number(key)
                if (Number.isFinite(idx)) {
                  if (idx < hitIdx) next[idx] = prev[idx]
                  else if (idx > hitIdx) next[idx - 1] = prev[idx]
                }
              })
              return next
            })
            setLayerByPoly(prev => {
              const next = {}
              Object.keys(prev).forEach((key) => {
                const idx = Number(key)
                if (Number.isFinite(idx)) {
                  if (idx < hitIdx) next[idx] = prev[idx]
                  else if (idx > hitIdx) next[idx - 1] = prev[idx]
                }
              })
              return next
            })
          }
        }
      } finally {
        if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null }
      }
    }, 600)
  }

  function cancelLongPress() {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null }
  }

  // Compute snapped point: pure axis snap to last point in active ring (screen-space tolerance)
  function getSnappedPoint(p, cw, ch) {
    if (!(activeRing && activeRing.length)) return p
    const last = activeRing[activeRing.length - 1]
    const pc = worldToCanvas(p.x, p.y, cw, ch)
    const pl = worldToCanvas(last[0], last[1], cw, ch)
    const dx = Math.abs(pc.x - pl.x)
    const dy = Math.abs(pc.y - pl.y)
    const tolPx = 16 // canvas pixels
    if (dx <= tolPx || dy <= tolPx) {
      if (dx <= dy && dx <= tolPx) return { x: last[0], y: p.y }
      if (dy < dx && dy <= tolPx) return { x: p.x, y: last[1] }
    }
    return p
  }

  const onDropPoint = () => {
    if (mode !== 'draw') return
    const cvs = canvasRef.current; if (!cvs) return
    // Use snapped canvas position when both guides are present; otherwise center
    if (snapRef.current?.active) {
      const p = canvasToWorld(snapRef.current.x, snapRef.current.y, cvs.width, cvs.height)
      setActiveRing(prev => [...prev, [p.x, p.y]])
    } else {
      const p = canvasCenterToWorld(cvs.width, cvs.height)
      setActiveRing(prev => [...prev, [p.x, p.y]])
    }
  }

  // Pan (drag), zoom (wheel/pinch), and rotate (two-finger twist)
  // Bind handlers once and read latest state via refs to prevent cursor reversion
  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs || !img) return
  const edgeTypes = ['unknown','eave','rake','ridge','hip','valley','flashing','parapet','transition']
    function nearestEdgeIndex(px, py, ring) {
      if (!ring || ring.length < 2) return -1
      let best = { idx: -1, d2: Infinity }
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]
        const b = ring[(i+1)%ring.length]
        const pa = worldToCanvas(a[0], a[1], cvs.width, cvs.height)
        const pb = worldToCanvas(b[0], b[1], cvs.width, cvs.height)
        // point-line segment distance squared
        const vx = pb.x - pa.x, vy = pb.y - pa.y
        const wx = px - pa.x, wy = py - pa.y
        const c1 = vx*wx + vy*wy
        const c2 = vx*vx + vy*vy || 1e-9
        let t = c1 / c2
        t = Math.max(0, Math.min(1, t))
        const projx = pa.x + t*vx
        const projy = pa.y + t*vy
        const dx = px - projx, dy = py - projy
        const d2 = dx*dx + dy*dy
        if (d2 < best.d2) best = { idx: i, d2 }
      }
      return best.idx
    }

    const onDown = (e) => {
      // label/pitch modes select/cycle instead of dragging the view if clicked quickly
      if (mode !== 'draw') {
        const rect = cvs.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        if (mode === 'label') {
          // More sensitive: pick nearest edge across all polygons within a pixel tolerance
          const tolPx = 28
          const tol2 = tolPx * tolPx
          let best = { poly: -1, edge: -1, d2: Infinity }
          for (let p=0; p<polygons.length; p++) {
            const ring = polygons[p]
            if (!ring || ring.length < 2) continue
            for (let i=0;i<ring.length;i++) {
              const a = ring[i]
              const b = ring[(i+1)%ring.length]
              const pa = worldToCanvas(a[0], a[1], cvs.width, cvs.height)
              const pb = worldToCanvas(b[0], b[1], cvs.width, cvs.height)
              const vx = pb.x - pa.x, vy = pb.y - pa.y
              const wx = x - pa.x,  wy = y - pa.y
              const c1 = vx*wx + vy*wy
              const c2 = vx*vx + vy*vy || 1e-9
              let t = c1 / c2; t = Math.max(0, Math.min(1, t))
              const projx = pa.x + t*vx
              const projy = pa.y + t*vy
              const dx = x - projx, dy = y - projy
              const d2 = dx*dx + dy*dy
              if (d2 < best.d2) best = { poly: p, edge: i, d2 }
            }
          }
          if (best.poly >= 0 && best.d2 <= tol2) {
            setSelectedPolyIndex(best.poly)
            setEdgesByPoly(prev => {
              const arr = prev[best.poly]?.slice() || new Array(polygons[best.poly].length).fill('unknown')
              const choice = activeLabelTypeRef.current || 'unknown'
              const nextType = choice === 'unknown'
                ? edgeTypes[(edgeTypes.indexOf(arr[best.edge] || 'unknown') + 1) % edgeTypes.length]
                : choice
              arr[best.edge] = nextType
              return { ...prev, [best.poly]: arr }
            })
            return
          }
          // Fallback: if click inside a polygon, assign within that polygon
          const world = canvasToWorld(x, y, cvs.width, cvs.height)
          let hitIdx = -1
          for (let i=0;i<polygons.length;i++) {
            const ring = polygons[i]
            if (ring && ring.length>=3 && pointInRing(world.x, world.y, ring)) { hitIdx = i; break }
          }
          if (hitIdx >= 0) {
            setSelectedPolyIndex(hitIdx)
            const edgeIdx = nearestEdgeIndex(x, y, polygons[hitIdx])
            if (edgeIdx >= 0) {
              setEdgesByPoly(prev => {
                const arr = prev[hitIdx]?.slice() || new Array(polygons[hitIdx].length).fill('unknown')
                const choice = activeLabelTypeRef.current || 'unknown'
                const nextType = choice === 'unknown'
                  ? edgeTypes[(edgeTypes.indexOf(arr[edgeIdx] || 'unknown') + 1) % edgeTypes.length]
                  : choice
                arr[edgeIdx] = nextType
                return { ...prev, [hitIdx]: arr }
              })
            }
            return
          }
        } else {
          // Pitch mode: tap inside a polygon assigns currentPitch to that polygon
          const world = canvasToWorld(x, y, cvs.width, cvs.height)
          let hitIdx = -1
          for (let i=0;i<polygons.length;i++) {
            const ring = polygons[i]
            if (ring && ring.length>=3 && pointInRing(world.x, world.y, ring)) { hitIdx = i; break }
          }
          if (hitIdx >= 0) {
            setSelectedPolyIndex(hitIdx)
            setPitchByPoly(prev => ({ ...prev, [hitIdx]: currentPitch }))
          }
        }
      }
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        start: { ...viewRef.current },
        startW: viewRef.current.w || img.width,
        startH: viewRef.current.h || img.height,
        cw: cvs.width,
        ch: cvs.height,
      }
      scheduleLongPress(e.clientX, e.clientY, cvs)
    }
    const onMove = (e) => {
      if (!dragRef.current) return
      lastPosRef.current = { x: e.clientX, y: e.clientY }
      // Cancel long press if moved too far
      const mdx = e.clientX - longPressStartRef.current.x
      const mdy = e.clientY - longPressStartRef.current.y
      if ((mdx*mdx + mdy*mdy) > 64) cancelLongPress()
      const dx = e.clientX - dragRef.current.x
      const dy = e.clientY - dragRef.current.y
      const scaleX = (dragRef.current.startW || img.width) / (dragRef.current.cw || 1)
      const scaleY = (dragRef.current.startH || img.height) / (dragRef.current.ch || 1)
  const nx = Math.max(0, Math.min(Math.max(0, img.width - (viewRef.current.w || img.width)), dragRef.current.start.x - (dx * scaleX)))
  const ny = Math.max(0, Math.min(Math.max(0, img.height - (viewRef.current.h || img.height)), dragRef.current.start.y - (dy * scaleY)))
  setView(v => ({ ...v, x: nx, y: ny }))
    }
    const onUp = () => { dragRef.current = null; cancelLongPress() }
    const onWheel = (e) => {
      e.preventDefault()
      if (lockZoomRef.current) return
      const factor = Math.exp(-e.deltaY * 0.0015)
      const minScale = initialScaleRef.current || 1
      const maxScale = 8
      const vw = viewRef.current.w || img.width
      const vh = viewRef.current.h || img.height
      const curScale = img.width / vw
      const newScale = Math.max(minScale, Math.min(maxScale, curScale * factor))
      const newW = img.width / newScale
      const newH = img.height / newScale
      // Zoom around canvas center -> keep center target
      const cx = (viewRef.current.x || 0) + vw/2
      const cy = (viewRef.current.y || 0) + vh/2
      setView({ x: Math.max(0, cx - newW/2), y: Math.max(0, cy - newH/2), w: newW, h: newH })
    }
    // Touch pinch
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        const [a,b] = e.touches
        const dist = Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY)
        const angle = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX)
        pinchRef.current = { dist, start: { ...viewRef.current }, angle }
        cancelLongPress()
      } else if (e.touches.length === 1) {
        dragRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          start: { ...viewRef.current },
          startW: viewRef.current.w || img.width,
          startH: viewRef.current.h || img.height,
          cw: cvs.width,
          ch: cvs.height,
        }
        scheduleLongPress(e.touches[0].clientX, e.touches[0].clientY, cvs)
      }
    }
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && pinchRef.current.start) {
        const [a,b] = e.touches
        const dist = Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY)
  const factor = dist / (pinchRef.current.dist || dist)
  const minScale = initialScaleRef.current || 1
  const maxScale = 8
        const curScale = img.width / (viewRef.current.w || img.width)
        const newScale = Math.max(minScale, Math.min(maxScale, curScale * factor))
        if (!lockZoomRef.current) {
          const newW = img.width / newScale
          const newH = img.height / newScale
          const cx = pinchRef.current.start.x + pinchRef.current.start.w/2
          const cy = pinchRef.current.start.y + pinchRef.current.start.h/2
          setView({ x: Math.max(0, cx - newW/2), y: Math.max(0, cy - newH/2), w: newW, h: newH })
        }
        // Two-finger rotate gesture
  if (!lockRotationRef.current) {
          const ang = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX)
          const delta = (ang - (pinchRef.current.angle ?? ang)) * 180 / Math.PI
          setAngle(prev => prev + delta)
          pinchRef.current.angle = ang
        }
        cancelLongPress()
      } else if (e.touches.length === 1 && dragRef.current) {
        lastPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        const mdx = lastPosRef.current.x - longPressStartRef.current.x
        const mdy = lastPosRef.current.y - longPressStartRef.current.y
        if ((mdx*mdx + mdy*mdy) > 64) cancelLongPress()
        const dx = e.touches[0].clientX - dragRef.current.x
        const dy = e.touches[0].clientY - dragRef.current.y
        const scaleX = (dragRef.current.startW || img.width) / (dragRef.current.cw || 1)
        const scaleY = (dragRef.current.startH || img.height) / (dragRef.current.ch || 1)
  const nx = Math.max(0, Math.min(Math.max(0, img.width - (viewRef.current.w || img.width)), dragRef.current.start.x - (dx * scaleX)))
  const ny = Math.max(0, Math.min(Math.max(0, img.height - (viewRef.current.h || img.height)), dragRef.current.start.y - (dy * scaleY)))
  setView(v => ({ ...v, x: nx, y: ny }))
      }
    }
    const onTouchEnd = () => { dragRef.current = null; pinchRef.current = { dist: 0, start: null }; cancelLongPress() }
  cvs.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    cvs.addEventListener('wheel', onWheel, { passive: false })
    cvs.addEventListener('touchstart', onTouchStart, { passive: true })
    cvs.addEventListener('touchmove', onTouchMove, { passive: true })
    cvs.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      cvs.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      cvs.removeEventListener('wheel', onWheel)
      cvs.removeEventListener('touchstart', onTouchStart)
      cvs.removeEventListener('touchmove', onTouchMove)
      cvs.removeEventListener('touchend', onTouchEnd)
    }
  }, [img])

  const onUndoPoint = () => {
    if (mode !== 'draw') return
    setActiveRing(prev => prev.slice(0, -1))
  }

  // Auto-close polygon when the last point is near the first and we have >=3 points
  useEffect(() => {
  if (activeRing.length >= 3) {
      const [sx, sy] = activeRing[0]
      const [lx, ly] = activeRing[activeRing.length - 1]
      const d = Math.hypot(lx - sx, ly - sy)
      if (d <= 8) { // 8px tolerance on image pixels
    setPolygons(prev => [...prev, activeRing.slice(0, -1)])
    setLayerByPoly(prev => ({ ...prev, [polygons.length]: activeLayerId }))
    setEdgesByPoly(prev => ({ ...prev, [polygons.length]: new Array(Math.max(0, activeRing.length - 1)).fill('unknown') }))
        setActiveRing([])
      }
    }
  }, [activeRing])

  // Keep edges array lengths in sync with polygon rings
  useEffect(() => {
    setEdgesByPoly(prev => {
      const next = { ...prev }
      polygons.forEach((ring, idx) => {
        const want = Math.max(0, ring.length)
        const arr = (next[idx]?.slice() || [])
        if (arr.length !== want) {
          const filled = new Array(want).fill('unknown')
          for (let i=0;i<Math.min(arr.length, want);i++) filled[i] = arr[i]
          next[idx] = filled
        }
      })
      return next
    })
  }, [polygons])

  const onSave = async () => {
    try {
      setSaving(true)
      // Convert polygons (image pixel coords) to Feature array similar to CRM editor
      const featureList = polygons.map((ring, idx) => ({
        type: 'Feature',
        properties: {
          id: `plane_${idx+1}`,
          layerId: layerByPoly[idx] || 'L1',
          pitch: pitchByPoly[idx] ?? 6,
          edges: ring.map((_, i) => ({ i, type: edgesByPoly[idx]?.[i] || 'unknown' }))
        },
        geometry: { type: 'Polygon', coordinates: [ring] }
      }))
      const r = await recomputeMeasurement(measurementId, featureList, 6)
      if (!r || !r.id) throw new Error('Save failed')
      alert('Saved')
      onBack?.()
    } catch (e) {
      alert(e?.message || String(e))
    } finally { setSaving(false) }
  }

  return (
    <div className="h-[calc(100vh-56px-48px)] w-full">{/* full height minus header+safe bottom approx */}
      <div ref={wrapRef} className="relative w-full h-full bg-black touch-none">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
        {/* Label palette top bar (compact, non-blocking) */}
        {mode==='label' && (
          <div className="fixed top-16 left-0 right-0 z-30 px-3 md:px-4">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-2 rounded border bg-white/95 backdrop-blur-sm shadow">
              {LABEL_TYPES.map(l => (
                <button key={l.key}
                  onClick={()=> setActiveLabelType(l.key)}
                  className={`flex items-center gap-1.5 px-2 py-1 border rounded-full text-[11px] whitespace-nowrap ${activeLabelType===l.key? 'ring-2 ring-offset-1 ring-blue-400':''}`}
                  title={l.name}
                >
                  <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: l.color }} />
                  <span className="capitalize">{l.key}</span>
                </button>
              ))}
            </div>
          </div>
        )}
  {/* Top-left modes; push down further when label bar is shown */}
  <div className={`fixed ${mode==='label' ? 'top-28' : 'top-16'} left-3 md:left-4 z-30 flex items-center gap-2 max-w-[45vw]`}>
          {['draw','label','pitch'].map(m => (
            <button key={m}
              onClick={()=> setMode(m)}
              className={`px-2 py-1 rounded border text-xs ${mode===m? 'bg-sky-600 text-white border-sky-600':'bg-white/90'}`}
            >{m[0].toUpperCase()+m.slice(1)}</button>
          ))}
        </div>
  {/* Top-right layers (letters, scrollable). Also offset in label mode */}
  <div className={`fixed ${mode==='label' ? 'top-28' : 'top-16'} right-3 md:right-4 z-30 flex items-center gap-2 max-w-[55vw] overflow-x-auto pl-2`}>
          {layers.map((l, idx) => {
            const toLetters = (n)=>{ let s=''; n++; while(n>0){ const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); } return s };
            const label = toLetters(idx);
            return (
              <button key={l.id}
                onClick={()=> setActiveLayerId(l.id)}
                className={`px-2 py-1 rounded border text-xs whitespace-nowrap ${activeLayerId===l.id? 'bg-emerald-600 text-white border-emerald-600':'bg-white/90'}`}
              >{label}</button>
            );
          })}
          <button
            onClick={()=> {
              const nid = `L${layers.length+1}`
              const toLetters = (n)=>{ let s=''; n++; while(n>0){ const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); } return s };
              const name = toLetters(layers.length)
              setLayers(prev => [...prev, { id: nid, name }])
              setActiveLayerId(nid)
            }}
            className="px-2 py-1 rounded border text-xs bg-white/90"
          >+ Layer</button>
        </div>
        {/* Bottom-right controls */}
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+12px)] right-3 md:right-4 z-20 flex flex-col gap-2">
            <button disabled={mode!=='draw'} onClick={onDropPoint} className={`px-3 py-2 rounded-lg text-sm border active:bg-neutral-50 shadow ${mode==='draw'?'bg-white border-neutral-200':'bg-neutral-200/50 border-neutral-200 cursor-not-allowed'}`}>Drop point</button>
            <button disabled={mode!=='draw'} onClick={onUndoPoint} className={`px-3 py-2 rounded-lg text-sm border active:bg-neutral-50 shadow ${mode==='draw'?'bg-white border-neutral-200':'bg-neutral-200/50 border-neutral-200 cursor-not-allowed'}`}>Undo</button>
        </div>
        {/* Bottom-left: small icon-style lock buttons */}
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+12px)] left-3 md:left-4 z-20 flex items-center gap-2">
          <button
            onClick={()=> setLockZoom(v=>!v)}
            aria-label="Toggle zoom lock"
            className={`w-9 h-9 rounded-full border shadow flex items-center justify-center text-xs ${lockZoom? 'bg-sky-600 text-white border-sky-600':'bg-white'}`}
          >{lockZoom? 'Z🔒':'Z🔓'}</button>
          <button
            onClick={()=> setLockRotation(v=>!v)}
            aria-label="Toggle rotation lock"
            className={`w-9 h-9 rounded-full border shadow flex items-center justify-center text-xs ${lockRotation? 'bg-sky-600 text-white border-sky-600':'bg-white'}`}
          >{lockRotation? 'R🔒':'R🔓'}</button>
        </div>
    {/* Pitch mini-control in pitch mode: sets the current pitch to assign on tap */}
        {mode==='pitch' && (
          <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+12px)] left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-white/90 border border-neutral-200 rounded-lg p-2">
      <span className="text-xs text-neutral-700">Pitch</span>
      <button onClick={()=> setCurrentPitch(v=> Math.max(0, v-1))} className="px-2 py-1 rounded border text-xs">-</button>
      <div className="text-xs min-w-[28px] text-center">{currentPitch}/12</div>
      <button onClick={()=> setCurrentPitch(v=> Math.min(24, v+1))} className="px-2 py-1 rounded border text-xs">+</button>
      <span className="text-[10px] text-neutral-500 ml-1">Tap inside a plane to assign</span>
          </div>
        )}
      </div>
  <div className="flex items-center justify-between">
        <button onClick={onBack} className="px-3 py-2 rounded-lg text-sm border border-neutral-200 bg-white active:bg-neutral-50">Cancel</button>
        <button disabled={saving} onClick={onSave} className="px-3 py-2 rounded-lg text-sm bg-sky-600 text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}
