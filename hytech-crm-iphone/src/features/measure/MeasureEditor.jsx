import React, { useEffect, useRef, useState } from 'react'
import { recomputeMeasurement } from '../../lib/api.js'

// Simple mobile measurement editor with crosshair and drop-point button.
// Expects props: { measurementId, imageSrc, initialFeatures }
export default function MeasureEditor({ measurementId, imageSrc, initialFeatures = [], gsdMPerPx = null, onBack, contactId, onReportSaved }) {
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
  const angleRef = useRef(0)
  const [lockRotation, setLockRotation] = useState(false)
  const [lockZoom, setLockZoom] = useState(false)
  const lockRotationRef = useRef(false)
  const lockZoomRef = useRef(false)
  const [pitchByPoly, setPitchByPoly] = useState({}) // { polyIndex: pitchIn12 }
  // Modes & Layers
  const [mode, setMode] = useState('draw') // 'draw' | 'label' | 'pitch' | 'accessories'
  const modeRef = useRef('draw')
  const [layers, setLayers] = useState(() => [{ id: 'L1', name: 'Layer 1' }])
  const [activeLayerId, setActiveLayerId] = useState('L1')
  const [layerByPoly, setLayerByPoly] = useState({}) // { polyIndex: layerId }
  const [edgesByPoly, setEdgesByPoly] = useState({}) // { polyIndex: Array<'unknown'|'eave'|'rake'|'ridge'|'hip'|'valley'> }
  const [selectedPolyIndex, setSelectedPolyIndex] = useState(null)
  // Accessories state
  const ACCESSORY_TYPES = [
    { key: 'skylight', name: 'Skylight', color: 'rgba(255,255,255,0.95)', ring: 'rgba(99,102,241,0.9)' },
    { key: 'vent', name: 'Vent', color: 'rgba(255,255,255,0.95)', ring: 'rgba(16,185,129,0.9)' },
    { key: 'pipe', name: 'Pipe Flange', color: 'rgba(255,255,255,0.95)', ring: 'rgba(234,88,12,0.9)' },
    { key: 'other', name: 'Other', color: 'rgba(255,255,255,0.95)', ring: 'rgba(107,114,128,0.9)' },
  ]
  const [activeAccType, setActiveAccType] = useState(null) // no selection by default
  const activeAccTypeRef = useRef(null)
  useEffect(()=> { activeAccTypeRef.current = activeAccType }, [activeAccType])
  const [accessoriesByPoly, setAccessoriesByPoly] = useState({}) // { polyIndex: [{id,type,x,y,data,polyIndex}] }
  const [editingAccessory, setEditingAccessory] = useState(null) // full accessory object
  const [accessoryDraft, setAccessoryDraft] = useState(null) // mutable draft during edit
  const [selectedAccessoryId, setSelectedAccessoryId] = useState(null)
  const accessoriesByPolyRef = useRef(accessoriesByPoly)
  useEffect(()=> { accessoriesByPolyRef.current = accessoriesByPoly }, [accessoriesByPoly])
  // Pitch editing: global current pitch value used for assignments in pitch mode
  const [currentPitch, setCurrentPitch] = useState(6)
  const currentPitchRef = useRef(6)
  const polygonsRef = useRef(polygons)
  // Debug overlay state (must be declared before listeners referencing setters)
  const [showDebug, setShowDebug] = useState(false)
  const [debugClick, setDebugClick] = useState(null) // {x,y,ts}
  const [debugEdgeMid, setDebugEdgeMid] = useState(null)
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
  useEffect(()=> { modeRef.current = mode }, [mode])
  useEffect(()=> { polygonsRef.current = polygons }, [polygons])
  useEffect(()=> { currentPitchRef.current = currentPitch }, [currentPitch])
  useEffect(()=> { angleRef.current = angle }, [angle])
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
      const pitch = pitchByPoly[polyIdx] ?? 6
      // Slope multiplier: rake uses sqrt(1 + (p/12)^2). For hip/valley we approximate compound slope sqrt(2 + (p/12)^2).
      const pRatio = pitch / 12
      const rakeFactor = Math.sqrt(1 + pRatio*pRatio)
      const hipValleyFactor = Math.sqrt(2 + pRatio*pRatio)
    let adjFt = ft
    if (type === 'rake') adjFt = ft * rakeFactor
    else if (type === 'hip' || type === 'valley') adjFt = ft * hipValleyFactor
      const label = `${adjFt.toFixed(1)} ft${type !== 'unknown' ? ` • ${type}` : ''}`
      ctx.fillText(label, midx+4, midy-4)
          }
        }
      }
      // Pitch label for polygon (only in pitch mode)
      if (mode === 'pitch') {
    const pitch = pitchByPoly[polyIdx] ?? 6
    // Centroid for label placement (simple average of vertices)
    let cxSum = 0, cySum = 0
    for (const [vx, vy] of ring) { cxSum += vx; cySum += vy }
    const cnt = ring.length || 1
    const cwx = cxSum / cnt
    const cwy = cySum / cnt
    const pc = worldToCanvas(cwx, cwy, cvs.width, cvs.height)
    ctx.fillStyle = 'rgba(0,0,0,0.8)'
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif'
    ctx.fillText(`${pitch}/12`, pc.x - 14, pc.y + 4)
      }
      ctx.restore()
    })
    // Draw accessories (markers) over polygons
    Object.keys(accessoriesByPoly).forEach(k => {
      const idx = Number(k)
      const list = accessoriesByPoly[idx] || []
      for (const a of list) {
        const p = worldToCanvas(a.x, a.y, cvs.width, cvs.height)
        ctx.save()
        const def = ACCESSORY_TYPES.find(t => t.key === a.type) || ACCESSORY_TYPES[0]
        ctx.beginPath(); ctx.arc(p.x, p.y, selectedAccessoryId===a.id ? 11 : 8, 0, Math.PI*2)
        ctx.fillStyle = def.color
        ctx.fill()
        ctx.lineWidth = selectedAccessoryId===a.id ? 3 : 2
        ctx.strokeStyle = def.ring
        ctx.stroke()
        ctx.font = '10px system-ui, -apple-system, sans-serif'
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const label = a.type === 'skylight' ? (a.data?.size || 'Sky') : (a.type === 'vent' ? (a.data?.ventType || 'Vent') : (a.type === 'pipe' ? (a.data?.flangeSize || 'Pipe') : (a.data?.note ? a.data.note.slice(0,6) : 'Other')))
        ctx.fillText(label, p.x, p.y)
        ctx.restore()
      }
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
  // NOTE: Added edgesByPoly, mode, pitchByPoly, layerByPoly, activeLayerId, and activeLabelType to dependency list
  // so that labeling/pitch assignments trigger immediate redraw. Previously missing, causing user clicks
  // in label mode not to visually update edge colors until another dependency changed.
  }, [img, polygons, activeRing, view, angle, edgesByPoly, mode, pitchByPoly, layerByPoly, activeLayerId, activeLabelType, accessoriesByPoly])

  // Convert world(image) -> canvas(screen) with current view+angle
  function worldToCanvas(x, y, cw, ch) {
  const vLive = viewRef.current
  const v = (vLive.w && vLive.h && img) ? vLive : (img ? { x:0, y:0, w: img.width, h: img.height } : vLive)
    // view window translates (x,y) into view space, then scale to canvas, then rotate around center
  const sx = ((x - (v.x||0)) / (v.w || 1)) * cw
  const sy = ((y - (v.y||0)) / (v.h || 1)) * ch
    // rotate about center
    const cx = cw/2, cy = ch/2
    const dx = sx - cx, dy = sy - cy
    const a = (angleRef.current || 0) * Math.PI/180
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
    const vLive = viewRef.current
    const v = (vLive.w && vLive.h && img) ? vLive : (img ? { x:0, y:0, w: img.width, h: img.height } : vLive)
    const cx = cw/2, cy = ch/2
    // inverse rotate
    const dx = x - cx, dy = y - cy
    const a = -(angleRef.current || 0) * Math.PI/180
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
        // ACCESSORY LONG-PRESS: search globally first so slight misses outside polygon still open editor
        if (mode === 'accessories') {
          const tolPx = 30
          let found = null
          const accMap = accessoriesByPolyRef.current || {}
          outerLP: for (const polyKey of Object.keys(accMap)) {
            const list = accMap[Number(polyKey)] || []
            for (const a of list) {
              const pc = worldToCanvas(a.x, a.y, cvs.width, cvs.height)
              const dx = lastPosRef.current.x - pc.x
              const dy = lastPosRef.current.y - pc.y
              if (dx*dx + dy*dy <= tolPx*tolPx) { found = a; break outerLP }
            }
          }
          if (found) {
            setEditingAccessory(found)
            setAccessoryDraft({ ...found })
            setSelectedAccessoryId(found.id)
            return
          }
        }
        // Polygon delete long press (draw mode) still needs polygon hit
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
  // Previously used canvasCenterToWorld (ignored rotation). Use canvas center through canvasToWorld to honor rotation.
  const centerX = cvs.width / 2
  const centerY = cvs.height / 2
  const p = canvasToWorld(centerX, centerY, cvs.width, cvs.height)
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
      const modeNow = modeRef.current
      const polygonsNow = polygonsRef.current
      if (modeNow !== 'draw' && modeNow !== 'accessories') {
        const rect = cvs.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
  // Record raw click for debug overlay
  setDebugClick({ x, y, ts: Date.now() })
        if (modeNow === 'label') {
          // LABEL MODE EDGE PICKING:
          // We search every polygon edge for nearest distance to the click within a tolerance, then assign.
          // If activeLabelType is 'unknown' we cycle through edgeTypes; otherwise we force the selection.
          // This allows: (a) tap an explicit label pill first then tap edges to assign, OR
          // (b) leave active pill on 'unknown' and single-tap edges repeatedly to cycle classifications.
          // More sensitive: pick nearest edge across all polygons within a pixel tolerance
          const tolPx = 28
          const tol2 = tolPx * tolPx
          let best = { poly: -1, edge: -1, d2: Infinity }
          for (let p=0; p<polygonsNow.length; p++) {
            const ring = polygonsNow[p]
            if (!ring || ring.length < 2) continue
            // Restrict labeling to active layer only
            const lyr = (layerByPoly[p] || 'L1')
            if (lyr !== activeLayerId) continue
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
              const arr = prev[best.poly]?.slice() || new Array(polygonsNow[best.poly].length).fill('unknown')
              const choice = activeLabelTypeRef.current || 'unknown'
              const nextType = choice === 'unknown'
                ? edgeTypes[(edgeTypes.indexOf(arr[best.edge] || 'unknown') + 1) % edgeTypes.length]
                : choice
              arr[best.edge] = nextType
        // Debug edge midpoint
        const a = polygonsNow[best.poly][best.edge]
        const b = polygonsNow[best.poly][(best.edge+1)%polygonsNow[best.poly].length]
        const pa = worldToCanvas(a[0], a[1], cvs.width, cvs.height)
        const pb = worldToCanvas(b[0], b[1], cvs.width, cvs.height)
        setDebugEdgeMid({ x: (pa.x+pb.x)/2, y: (pa.y+pb.y)/2, ts: Date.now() })
              return { ...prev, [best.poly]: arr }
            })
            return
          }
          // Fallback: if click inside a polygon, assign within that polygon
          const world = canvasToWorld(x, y, cvs.width, cvs.height)
          let hitIdx = -1
          for (let i=0;i<polygonsNow.length;i++) {
            const ring = polygonsNow[i]
            if (ring && ring.length>=3 && pointInRing(world.x, world.y, ring)) { hitIdx = i; break }
          }
          // Enforce active layer restriction
          if (hitIdx >= 0) {
            const lyr = (layerByPoly[hitIdx] || 'L1')
            if (lyr !== activeLayerId) hitIdx = -1
          }
          if (hitIdx >= 0) {
            setSelectedPolyIndex(hitIdx)
            const edgeIdx = nearestEdgeIndex(x, y, polygonsNow[hitIdx])
            if (edgeIdx >= 0) {
              setEdgesByPoly(prev => {
                const arr = prev[hitIdx]?.slice() || new Array(polygonsNow[hitIdx].length).fill('unknown')
                const choice = activeLabelTypeRef.current || 'unknown'
                const nextType = choice === 'unknown'
                  ? edgeTypes[(edgeTypes.indexOf(arr[edgeIdx] || 'unknown') + 1) % edgeTypes.length]
                  : choice
                arr[edgeIdx] = nextType
                const a = polygonsNow[hitIdx][edgeIdx]
                const b = polygonsNow[hitIdx][(edgeIdx+1)%polygonsNow[hitIdx].length]
                const pa = worldToCanvas(a[0], a[1], cvs.width, cvs.height)
                const pb = worldToCanvas(b[0], b[1], cvs.width, cvs.height)
                setDebugEdgeMid({ x: (pa.x+pb.x)/2, y: (pa.y+pb.y)/2, ts: Date.now() })
                return { ...prev, [hitIdx]: arr }
              })
            }
            return
          }
        } else if (modeNow === 'pitch') {
          // Pitch mode: tap inside a polygon assigns currentPitch to that polygon
          const world = canvasToWorld(x, y, cvs.width, cvs.height)
          let hitIdx = -1
          for (let i=0;i<polygonsNow.length;i++) {
            const ring = polygonsNow[i]
            if (ring && ring.length>=3 && pointInRing(world.x, world.y, ring)) { hitIdx = i; break }
          }
          if (hitIdx >= 0) {
            setSelectedPolyIndex(hitIdx)
            setPitchByPoly(prev => ({ ...prev, [hitIdx]: currentPitchRef.current }))
          }
        }
      } else if (modeNow === 'accessories') {
        const rect = cvs.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const world = canvasToWorld(x, y, cvs.width, cvs.height)
        // First: check if clicking an existing accessory globally (so slight miss outside polygon still works)
        const accMapDown = accessoriesByPolyRef.current || {}
        const tolPxPrimary = 28
        let found = null
        outerA: for (const polyKey of Object.keys(accMapDown)) {
          const list = accMapDown[Number(polyKey)] || []
            for (const a of list) {
              const pc = worldToCanvas(a.x, a.y, cvs.width, cvs.height)
              const dx = x - pc.x
              const dy = y - pc.y
              if (dx*dx + dy*dy <= tolPxPrimary*tolPxPrimary) { found = a; break outerA }
            }
        }
        if (!found) {
          // Slight enlargement for secondary pass
          const tolPxSecondary = 40
          outerB: for (const polyKey of Object.keys(accMapDown)) {
            const list = accMapDown[Number(polyKey)] || []
            for (const a of list) {
              const pc = worldToCanvas(a.x, a.y, cvs.width, cvs.height)
              const dx = x - pc.x
              const dy = y - pc.y
              if (dx*dx + dy*dy <= tolPxSecondary*tolPxSecondary) { found = a; break outerB }
            }
          }
        }
        if (found) {
          if (selectedAccessoryId === found.id) {
            setSelectedAccessoryId(null)
            setEditingAccessory(null)
            setAccessoryDraft(null)
          } else {
            setEditingAccessory(found)
            setAccessoryDraft({ ...found })
            setSelectedAccessoryId(found.id)
          }
        } else {
          // No accessory hit: attempt creation only if inside a polygon AND a type is selected
          let hitIdx = -1
          for (let i=0;i<polygonsNow.length;i++) {
            const ring = polygonsNow[i]
            if (ring && ring.length>=3 && pointInRing(world.x, world.y, ring)) { hitIdx = i; break }
          }
          if (hitIdx >= 0 && activeAccTypeRef.current) {
            const id = `acc_${Date.now()}_${Math.random().toString(36).slice(2,7)}`
            const type = activeAccTypeRef.current
            let data = {}
            if (type === 'skylight') data = { size: 'M08' }
            else if (type === 'vent') data = { ventType: '636' }
            else if (type === 'pipe') data = { flangeSize: '1"-3"' }
            else if (type === 'other') data = { note: '' }
            const newAcc = { id, type, x: world.x, y: world.y, data, polyIndex: hitIdx }
            setAccessoriesByPoly(prev => {
              const arr = prev[hitIdx]?.slice() || []
              return { ...prev, [hitIdx]: [...arr, newAcc] }
            })
            setEditingAccessory(newAcc)
            setAccessoryDraft({ ...newAcc })
            setSelectedAccessoryId(id)
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
      // Convert screen drag delta into world delta accounting for rotation
      const a = (angleRef.current || 0) * Math.PI/180
      // inverse rotate drag vector
      const preDx = dx * Math.cos(a) + dy * Math.sin(a)
      const preDy = -dx * Math.sin(a) + dy * Math.cos(a)
      const scaleX = (dragRef.current.startW || img.width) / (dragRef.current.cw || 1)
      const scaleY = (dragRef.current.startH || img.height) / (dragRef.current.ch || 1)
      const worldDx = preDx * scaleX
      const worldDy = preDy * scaleY
      const maxX = Math.max(0, img.width - (viewRef.current.w || img.width))
      const maxY = Math.max(0, img.height - (viewRef.current.h || img.height))
      const nxRaw = dragRef.current.start.x - worldDx
      const nyRaw = dragRef.current.start.y - worldDy
      const nx = Math.max(0, Math.min(maxX, nxRaw))
      const ny = Math.max(0, Math.min(maxY, nyRaw))
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
        const aAng = (angleRef.current || 0) * Math.PI/180
        const preDx = dx * Math.cos(aAng) + dy * Math.sin(aAng)
        const preDy = -dx * Math.sin(aAng) + dy * Math.cos(aAng)
        const scaleX = (dragRef.current.startW || img.width) / (dragRef.current.cw || 1)
        const scaleY = (dragRef.current.startH || img.height) / (dragRef.current.ch || 1)
        const worldDx = preDx * scaleX
        const worldDy = preDy * scaleY
        const maxX = Math.max(0, img.width - (viewRef.current.w || img.width))
        const maxY = Math.max(0, img.height - (viewRef.current.h || img.height))
        const nxRaw = dragRef.current.start.x - worldDx
        const nyRaw = dragRef.current.start.y - worldDy
        const nx = Math.max(0, Math.min(maxX, nxRaw))
        const ny = Math.max(0, Math.min(maxY, nyRaw))
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
  }, [img, activeLayerId])


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
          edges: ring.map((_, i) => ({ i, type: edgesByPoly[idx]?.[i] || 'unknown' })),
          accessories: (accessoriesByPoly[idx] || []).map(a => ({ id: a.id, type: a.type, x: a.x, y: a.y, data: a.data }))
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

  // Report generation status
  const [reportStatus, setReportStatus] = useState('')
  const [reportLink, setReportLink] = useState(null)
  const [reporting, setReporting] = useState(false)

  async function generateReport() {
    if (!measurementId) {
      setReportStatus('Missing measurement id')
      alert('No measurement id')
      return
    }
    try {
      setReporting(true)
      setReportStatus('Preparing report…')
      // Build feature list (same as save)
      const featureList = polygons.map((ring, idx) => ({
        type: 'Feature',
        properties: {
          id: `plane_${idx+1}`,
          layerId: layerByPoly[idx] || 'L1',
          pitch: pitchByPoly[idx] ?? 6,
          edges: ring.map((_, i) => ({ i, type: edgesByPoly[idx]?.[i] || 'unknown' })),
          accessories: (accessoriesByPoly[idx] || []).map(a => ({ id: a.id, type: a.type, x: a.x, y: a.y, data: a.data }))
        },
        geometry: { type: 'Polygon', coordinates: [ring] }
      }))
      // Recompute totals to ensure squares/perimeter up to date
      let computedTotals = { edgeTotalsFt: null, accessoryTotals: null, totalSquares: null, totalPerimeterFt: null }
      try {
        const res = await fetch(`/api/measurements/${measurementId}/recompute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: featureList }) })
        const data = await res.json()
        try {
          const fc = JSON.parse(data?.geojson || '{}')
          const edgeTotalsFt = fc?.properties?.edgeTotalsFt || null
          const accessoryTotals = fc?.properties?.accessoryTotals || null
          const totalSquares = typeof data?.totalSquares === 'number' ? data.totalSquares : null
          const totalPerimeterFt = typeof data?.totalPerimeterFt === 'number' ? data.totalPerimeterFt : null
          computedTotals = { edgeTotalsFt, accessoryTotals, totalSquares, totalPerimeterFt }
        } catch {}
      } catch {}
      setReportStatus('Requesting PDF…')
      const planeSummaries = featureList.map((f, idx) => ({
        index: idx + 1,
        pitch: typeof f.properties?.pitch === 'number' ? f.properties.pitch : 6,
        vertices: f.geometry.coordinates[0].length,
        layerId: f.properties?.layerId || null
      }))
      // Removed snapshot capture: send view box and canvas dimensions for proportional server rendering
      const cvs = canvasRef.current
      // Robust fallback: if viewRef has not been initialized yet (w/h zero), derive from image size or polygon bounds
      const viewBox = (() => {
        const vr = viewRef.current || {}
        if (vr && vr.w > 0 && vr.h > 0) return { x: vr.x || 0, y: vr.y || 0, w: vr.w, h: vr.h }
        if (img) return { x: 0, y: 0, w: img.width, h: img.height }
        // Polygon bounding box fallback
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        polygons.forEach(ring => ring.forEach(([x,y]) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y }))
        if (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
          return { x: minX, y: minY, w: (maxX - minX) || 1, h: (maxY - minY) || 1 }
        }
        return { x: 0, y: 0, w: 1, h: 1 }
      })()
      const canvasSize = cvs ? { w: cvs.width, h: cvs.height } : null
      // Build accessory breakdown structure the server expects (type -> variant -> count)
      const accessoryList = Object.keys(accessoriesByPoly).flatMap(polyKey => {
        const idx = Number(polyKey)
        const planeId = `plane_${idx+1}`
        return (accessoriesByPoly[idx] || []).map(a => ({
          id: a.id,
          type: a.type,
          planeId,
          polyIndex: idx,
          x: a.x,
          y: a.y,
          data: a.data || {}
        }))
      })
      const accessoryBreakdown = (() => {
        const out = {}
        accessoryList.forEach(a => {
          const type = a.type || 'other'
          const variant = (a.data?.size || a.data?.ventType || a.data?.flangeSize || a.data?.note || 'generic').toString()
          out[type] = out[type] || {}
          out[type][variant] = (out[type][variant] || 0) + 1
        })
        return out
      })()
      // Create overlay-only snapshot (no background image) for pixel-perfect embedding
      let overlayImageData = null
      try {
        if (cvs && polygons.length) {
          const snap = document.createElement('canvas')
          snap.width = cvs.width
          snap.height = cvs.height
          const sctx = snap.getContext('2d')
          if (sctx) {
            sctx.clearRect(0,0,snap.width,snap.height)
            // Draw polygons (edges + labels) using current transform already applied to original canvas coordinates.
            // We replicate screen rendering by iterating polygons and transforming via worldToCanvas.
            const drawPolyRing = (ring, polyIdx) => {
              if (!ring || !ring.length) return
              // Fill
              sctx.save()
              const isActiveLayer = (layerByPoly[polyIdx] || 'L1') === activeLayerId
              sctx.lineWidth = 2
              sctx.fillStyle = isActiveLayer ? 'rgba(0,200,255,0.15)' : 'rgba(0,200,255,0.06)'
              sctx.beginPath()
              ring.forEach(([x,y], idx) => {
                const p = worldToCanvas(x,y,snap.width,snap.height)
                if (idx===0) sctx.moveTo(p.x,p.y); else sctx.lineTo(p.x,p.y)
              })
              sctx.closePath()
              sctx.fill()
              // Edges with label colors
              for (let i=0;i<ring.length;i++) {
                const a = ring[i]
                const b = ring[(i+1)%ring.length]
                const pa = worldToCanvas(a[0],a[1],snap.width,snap.height)
                const pb = worldToCanvas(b[0],b[1],snap.width,snap.height)
                const et = (edgesByPoly[polyIdx]?.[i]) || 'unknown'
                const col = labelColor(et, isActiveLayer?0.95:0.45)
                sctx.strokeStyle = col
                sctx.lineWidth = 2
                sctx.beginPath(); sctx.moveTo(pa.x,pa.y); sctx.lineTo(pb.x,pb.y); sctx.stroke()
              }
              // Vertices
              sctx.fillStyle = 'rgba(255,255,255,0.95)'
              sctx.strokeStyle = 'rgba(2,132,199,0.9)'
              for (const [vx,vy] of ring) {
                const p = worldToCanvas(vx,vy,snap.width,snap.height)
                sctx.beginPath(); sctx.arc(p.x,p.y,3,0,Math.PI*2); sctx.fill(); sctx.stroke()
              }
              // Mode-specific labels
              if (mode === 'label' && ring.length > 1) {
                sctx.fillStyle = 'rgba(0,0,0,0.65)'
                sctx.font = '11px system-ui,-apple-system,sans-serif'
                for (let i=0;i<ring.length;i++) {
                  const a = ring[i]
                  const b = ring[(i+1)%ring.length]
                  const pa = worldToCanvas(a[0],a[1],snap.width,snap.height)
                  const pb = worldToCanvas(b[0],b[1],snap.width,snap.height)
                  const midx = (pa.x+pb.x)/2
                  const midy = (pa.y+pb.y)/2
                  const dx = b[0]-a[0], dy = b[1]-a[1]
                  const px = Math.hypot(dx,dy)
                  const ft = gsdMPerPx ? (px * gsdMPerPx * 3.28084) : null
                  if (ft) {
                    const type = (edgesByPoly[polyIdx]?.[i]) || 'unknown'
                    const pitch = pitchByPoly[polyIdx] ?? 6
                    const pRatio = pitch / 12
                    const rakeFactor = Math.sqrt(1 + pRatio*pRatio)
                    const hipValleyFactor = Math.sqrt(2 + pRatio*pRatio)
                    let adjFt = ft
                    if (type === 'rake') adjFt = ft * rakeFactor
                    else if (type === 'hip' || type === 'valley') adjFt = ft * hipValleyFactor
                    const label = `${adjFt.toFixed(1)} ft${type !== 'unknown' ? ` • ${type}` : ''}`
                    sctx.fillText(label, midx+4, midy-4)
                  }
                }
              }
              if (mode === 'pitch') {
                const pitch = pitchByPoly[polyIdx] ?? 6
                let cxSum=0, cySum=0
                for (const [vx,vy] of ring) { cxSum+=vx; cySum+=vy }
                const cnt = ring.length || 1
                const cwx = cxSum / cnt
                const cwy = cySum / cnt
                const pc = worldToCanvas(cwx,cwy,snap.width,snap.height)
                sctx.fillStyle = 'rgba(0,0,0,0.75)'
                sctx.font = 'bold 12px system-ui,-apple-system,sans-serif'
                sctx.fillText(`${pitch}/12`, pc.x - 16, pc.y + 4)
              }
              sctx.restore()
            }
            polygons.forEach((ring, idx) => drawPolyRing(ring, idx))
            // Accessories
            Object.keys(accessoriesByPoly).forEach(k => {
              const idx = Number(k)
              const list = accessoriesByPoly[idx] || []
              list.forEach(a => {
                const p = worldToCanvas(a.x,a.y,snap.width,snap.height)
                const def = ACCESSORY_TYPES.find(t=>t.key===a.type) || ACCESSORY_TYPES[0]
                sctx.save()
                sctx.beginPath(); sctx.arc(p.x,p.y,8,0,Math.PI*2)
                sctx.fillStyle = def.color
                sctx.fill()
                sctx.lineWidth = 2
                sctx.strokeStyle = def.ring
                sctx.stroke()
                sctx.font = '10px system-ui,-apple-system,sans-serif'
                sctx.fillStyle = 'rgba(0,0,0,0.75)'
                sctx.textAlign = 'center'
                sctx.textBaseline = 'middle'
                const label = a.type === 'skylight' ? (a.data?.size || 'Sky') : (a.type === 'vent' ? (a.data?.ventType || 'Vent') : (a.type === 'pipe' ? (a.data?.flangeSize || 'Pipe') : (a.data?.note ? a.data.note.slice(0,6) : 'Other')))
                sctx.fillText(label, p.x, p.y)
                sctx.restore()
              })
            })
            overlayImageData = snap.toDataURL('image/png')
          }
        }
      } catch {}
      const body = {
        features: featureList,
        totals: computedTotals,
        accessoryList,
        accessoryBreakdown,
        // Retain legacy summary counts (may be used elsewhere)
        accessorySummary: (() => {
          const counts = {}
          accessoryList.forEach(a => { counts[a.type] = (counts[a.type] || 0) + 1 })
          return counts
        })(),
        planeSummaries,
        imageRotationDeg: angleRef.current || 0,
        viewBox,
        canvasSize,
        overlayImageData,
        saveToFiles: true
      }
      const repRes = await fetch(`/api/measurements/${measurementId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      console.log('[generateReport] response status', repRes.status)
  console.log('[generateReport] payload summary', { featureCount: featureList.length, viewBox, canvasSize, accessoryCount: accessoryList.length })
      if (!repRes.ok) {
        try { const err = await repRes.json(); throw new Error(err?.error || 'Report failed') } catch (e) { throw new Error(e?.message || 'Report failed') }
      }
      const repData = await repRes.json()
      if (repData?.ok) {
        setReportStatus('Report saved to customer documents')
        if (repData.fileId) {
          setReportLink(`/api/files/${repData.fileId}`)
          try { window.open(`/api/files/${repData.fileId}`, '_blank') } catch {}
        }
        try {
          // Notify parent so it can refresh the customer's documents list
          onReportSaved?.({ contactId, fileId: repData.fileId })
        } catch {}
      } else {
        setReportStatus('Report generated')
      }
    } catch (e) {
      setReportStatus(e?.message || 'Report generation failed')
      alert(e?.message || 'Report generation failed')
    } finally {
      setReporting(false)
    }
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
  <div className={`fixed ${(mode==='label') ? 'top-28' : 'top-16'} left-3 md:left-4 z-30 flex items-center gap-2 max-w-[45vw]`}>
          {['draw','label','pitch','accessories'].map(m => (
            <button key={m}
              onClick={()=> setMode(m)}
              className={`px-2 py-1 rounded border text-xs ${mode===m? 'bg-sky-600 text-white border-sky-600':'bg-white/90'}`}
            >{m[0].toUpperCase()+m.slice(1)}</button>
          ))}
        </div>
  {/* Top-right layers (letters, scrollable). Also offset in label mode */}
  <div className={`fixed ${(mode==='label') ? 'top-28' : 'top-16'} right-3 md:right-4 z-30 flex items-center gap-2 max-w-[55vw] overflow-x-auto pl-2`}>
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
          <button
            onClick={generateReport}
            disabled={reporting}
            className={`px-3 py-2 rounded-lg text-xs shadow ${reporting? 'bg-emerald-400 text-white opacity-70':'bg-emerald-600 text-white'}`}
            title="Generate and save measurement report"
          >{reporting? 'Submitting…':'Submit'}</button>
        </div>
        {/* Inline status near submit for quick feedback */}
        {reportStatus && (
          <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+56px)] left-3 md:left-4 z-20 max-w-[60vw] text-[10px] bg-white/90 backdrop-blur border border-neutral-200 rounded px-2 py-1 shadow">
            <span>{reportStatus}</span>
            {reportLink && <a href={reportLink} target="_blank" rel="noopener noreferrer" className="ml-2 underline">Open</a>}
          </div>
        )}
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
        {mode==='accessories' && (
          <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+72px)] left-1/2 -translate-x-1/2 z-30">
            <div className="flex items-center gap-2 py-1 px-2 rounded border bg-white/95 backdrop-blur-sm shadow max-w-[92vw] overflow-x-auto no-scrollbar">
              {ACCESSORY_TYPES.map(a => (
                <button
                  key={a.key}
                  onClick={()=> setActiveAccType(prev => prev===a.key ? null : a.key)}
                  className={`px-2 py-1 rounded border text-[11px] whitespace-nowrap flex items-center gap-1 ${activeAccType===a.key? 'bg-indigo-600 text-white border-indigo-600':'bg-white'}`}
                >{a.name}</button>
              ))}
              <span className="text-[10px] text-neutral-500 ml-1 whitespace-nowrap">Select a type, tap to add. Tap existing (or long‑press) to edit.</span>
              <button
                onClick={()=> setActiveAccType(null)}
                className={`ml-1 px-2 py-1 rounded border text-[11px] whitespace-nowrap ${activeAccType===null? 'bg-neutral-700 text-white border-neutral-700':'bg-white'}`}
              >None</button>
            </div>
          </div>
        )}
      </div>
      {showDebug && (
        <div className="absolute inset-0 pointer-events-none select-none">
          <svg className="w-full h-full">
            {debugClick && (
              <circle cx={debugClick.x} cy={debugClick.y} r={6} fill="none" stroke="yellow" strokeWidth={2} />
            )}
            {debugEdgeMid && (
              <circle cx={debugEdgeMid.x} cy={debugEdgeMid.y} r={5} fill="none" stroke="red" strokeWidth={2} />
            )}
          </svg>
        </div>
      )}
      <button onClick={()=> setShowDebug(s=>!s)} className="fixed bottom-2 left-1/2 -translate-x-1/2 z-40 text-[10px] px-2 py-1 bg-black/40 text-white rounded">{showDebug? 'Hide debug':'Show debug'}</button>
  <div className="flex items-center justify-between">
        <button onClick={onBack} className="px-3 py-2 rounded-lg text-sm border border-neutral-200 bg-white active:bg-neutral-50">Cancel</button>
        <div className="flex gap-2 items-center">
          <button disabled={saving} onClick={onSave} className="px-3 py-2 rounded-lg text-sm bg-sky-600 text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      {reportStatus && (
        <div className="mt-1 text-[11px] text-neutral-600 px-1">
          <span>{reportStatus}</span>
          {reportLink && <a href={reportLink} target="_blank" rel="noopener noreferrer" className="ml-2 underline">Open</a>}
        </div>
      )}
      {/* Accessory edit sheet */}
      {editingAccessory && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-neutral-200 shadow-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Edit {editingAccessory.type[0].toUpperCase()+editingAccessory.type.slice(1)}</div>
            <button onClick={()=> { setEditingAccessory(null); setAccessoryDraft(null) }} className="text-xs px-2 py-1 rounded border">Close</button>
          </div>
          {accessoryDraft?.type === 'skylight' && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-neutral-600">Size</label>
              <input
                type="text"
                value={accessoryDraft.data.size || 'M08'}
                placeholder="M08"
                onChange={e=> setAccessoryDraft(d=> ({ ...d, data: { ...d.data, size: e.target.value } }))}
                className="border rounded px-2 py-1 text-base w-full focus:outline-none"
                style={{ fontSize: '16px' }}
              />
            </div>
          )}
          {accessoryDraft?.type === 'vent' && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-neutral-600">Vent Type</label>
              <select value={accessoryDraft.data.ventType} onChange={e=> setAccessoryDraft(d=> ({ ...d, data: { ...d.data, ventType: e.target.value } }))} className="border rounded px-2 py-1 text-sm">
                {['636','634','B-vent'].map(v=> <option key={v}>{v}</option>)}
              </select>
            </div>
          )}
          {accessoryDraft?.type === 'pipe' && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-neutral-600">Pipe Flange Size</label>
              <select value={accessoryDraft.data.flangeSize} onChange={e=> setAccessoryDraft(d=> ({ ...d, data: { ...d.data, flangeSize: e.target.value } }))} className="border rounded px-2 py-1 text-sm">
                {['1"-3"','4"'].map(v=> <option key={v}>{v}</option>)}
              </select>
            </div>
          )}
          {accessoryDraft?.type === 'other' && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-neutral-600">Note</label>
              <input value={accessoryDraft.data.note} onChange={e=> setAccessoryDraft(d=> ({ ...d, data: { ...d.data, note: e.target.value } }))} placeholder="Custom note" className="border rounded px-2 py-1 text-base w-full focus:outline-none" style={{ fontSize: '16px' }} />
            </div>
          )}
          <div className="flex items-center justify-between pt-2">
            <button onClick={()=> {
              const idx = editingAccessory.polyIndex
              setAccessoriesByPoly(prev => {
                const arr = prev[idx]?.slice() || []
                return { ...prev, [idx]: arr.filter(a => a.id !== editingAccessory.id) }
              })
              setEditingAccessory(null)
              setAccessoryDraft(null)
              setSelectedAccessoryId(null)
            }} className="px-3 py-2 rounded text-sm border bg-red-50 text-red-600">Delete</button>
            <div className="flex gap-2">
              <button onClick={()=> { setEditingAccessory(null); setAccessoryDraft(null); }} className="px-3 py-2 rounded text-sm border">Cancel</button>
              <button onClick={()=> {
                const idx = editingAccessory.polyIndex
                setAccessoriesByPoly(prev => {
                  const arr = prev[idx]?.slice() || []
                  const mapped = arr.map(a => a.id === editingAccessory.id ? { ...accessoryDraft } : a)
                  return { ...prev, [idx]: mapped }
                })
                setEditingAccessory(null)
                setAccessoryDraft(null)
              }} className="px-3 py-2 rounded text-sm bg-indigo-600 text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
