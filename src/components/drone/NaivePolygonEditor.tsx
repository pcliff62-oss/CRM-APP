"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import type React from "react";
type EdgeType =
  | "eave"
  | "rake"
  | "ridge"
  | "valley"
  | "hip"
  | "flashing"
  | "parapet"
  | "transition"
  | "unknown";

const EDGE_COLORS: Record<EdgeType, string> = {
  eave: "#2dd4bf",
  rake: "#60a5fa",
  ridge: "#f97316",
  valley: "#f43f5e",
  hip: "#a78bfa",
  flashing: "#f59e0b",
  parapet: "#10b981",
  transition: "#ec4899",
  unknown: "#9ca3af",
};

type SegmentInfo = {
  fi: number;
  ei: number;
  dist: number;
  proj: { x: number; y: number };
  a: number[];
  b: number[];
} | null;

export type Feature = {
  type: "Feature";
  properties: {
    id?: string;
    pitch?: number;
    edges?: { i: number; type: EdgeType }[];
    accessories?: { id: string; type: string; x: number; y: number; data?: any }[];
    [k: string]: any;
  };
  geometry: { type: "Polygon"; coordinates: number[][][] };
};

export default function NaivePolygonEditor(props: {
  measurementId: string;
  imageSrc: string;
  initialFeatures: Feature[];
  defaultPitchIn12?: number;
  initialEdgeTotalsFt?: Record<string, number> | null;
  initialSquares?: number | null;
  initialPerimeterFt?: number | null;
}) {
  const { measurementId, imageSrc, initialFeatures, defaultPitchIn12 = 6, initialEdgeTotalsFt = null, initialSquares = null, initialPerimeterFt = null } = props;
  const [features, setFeatures] = useState<Feature[]>(initialFeatures);
  const [msg, setMsg] = useState<string | null>(null);
  const [totals, setTotals] = useState<{ edgeTotalsFt: Record<string, number> | null; accessoryTotals?: Record<string, number> | null; totalSquares: number | null; totalPerimeterFt: number | null}>({ edgeTotalsFt: initialEdgeTotalsFt, accessoryTotals: null, totalSquares: initialSquares, totalPerimeterFt: initialPerimeterFt });
  const [msgLink, setMsgLink] = useState<string | null>(null);
  const [loadOpen, setLoadOpen] = useState(false);
  const [versions, setVersions] = useState<{id:string; name:string|null; createdAt:string}[]|null>(null);
  const [scopeNote, setScopeNote] = useState<string>('');
  const [localVersions, setLocalVersions] = useState<{id:string; name:string|null; createdAt:string}[]|null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  // Initialize viewBox when image size known
  const accessoryDragTypeRef = useRef<string | null>(null);
  const [dragAccessory, setDragAccessory] = useState<null | { fi: number; accId: string }>(null);

  // Accessories config state
  const [skylightSize, setSkylightSize] = useState<string>('M08');
  const [ventOptions, setVentOptions] = useState<string[]>([]); // 636,634,B-Vent
  const [pipeFlangeSize, setPipeFlangeSize] = useState<string>('1"-2"');
  // Inline accessory edit state
  const [editingAccessory, setEditingAccessory] = useState<null | { fi: number; accId: string }>(null);
  const [accessoryDraft, setAccessoryDraft] = useState<any>(null);

  // Layer system: polygons can belong to layers (A,B,C...). Active layer editable; others dimmed.
  interface Layer { id: string; name: string; order: number; }
  const [layers, setLayers] = useState<Layer[]>([{ id: 'A', name: 'A', order: 0 }]);
  const [activeLayerId, setActiveLayerId] = useState<string>('A');

  // --- Editor core refs/state ---
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const [viewBox, setViewBox] = useState<null | { x: number; y: number; w: number; h: number }>(null);
  const [angleDeg, setAngleDeg] = useState<number>(0);
  const [mode, setMode] = useState<'draw' | 'label' | 'pitch'>('draw');

  // Drawing and editing interaction state
  const [drag, setDrag] = useState<null | { fi: number; pi: number }>(null);
  const [drawing, setDrawing] = useState<null | { points: number[][]; refs: any[] }>(null);
  const [hoverPt, setHoverPt] = useState<null | { x: number; y: number }>(null);
  const [snapHighlight, setSnapHighlight] = useState<null | { x: number; y: number }>(null);
  // Fixed snap sensitivities per request
  const SNAP_PX = 4; // axis/grid snap sensitivity in screen pixels
  const VERTEX_SNAP_PX = 6; // vertex snap sensitivity in screen pixels
  const [selectedFi, setSelectedFi] = useState<number | null>(null);

  // Whole-polygon dragging
  const [polyDrag, setPolyDrag] = useState<null | { fi: number; start: { x: number; y: number }; base: number[][] }>(null);
  const polyDragStartedRef = useRef<boolean>(false);

  // Panning helpers
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<null | { cx: number; cy: number; vb: { x: number; y: number; w: number; h: number } }>(null);
  const [leftPanPending, setLeftPanPending] = useState<boolean>(false);
  const suppressClickRef = useRef<boolean>(false);
  const [spaceDown, setSpaceDown] = useState<boolean>(false);

  // Label/Pitch helpers
  const [pitchValue, setPitchValue] = useState<number>(defaultPitchIn12);
  const [activeLabel, setActiveLabel] = useState<EdgeType>('unknown');

  // Initialize image size and viewBox on load
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const handle = () => {
      const w = (img.naturalWidth || img.width || 0) as number;
      const h = (img.naturalHeight || img.height || 0) as number;
      if (w && h) {
        setSize({ w, h });
        setViewBox({ x: 0, y: 0, w, h });
      }
    };
    if (img.complete) handle();
    else img.addEventListener('load', handle);
    return () => { try { img.removeEventListener('load', handle); } catch {} };
  }, [imageSrc]);

  // Ensure initial features have layer assignment
  useEffect(() => {
    setFeatures(prev => prev.map(f => {
      if (!f.properties) f.properties = {} as any;
      if (!f.properties.layerId) f.properties.layerId = layers[0].id;
      return f;
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Snapshot helpers ----
  function slimFeatures(fs: Feature[]): Feature[] {
    // Reduce payload: round coords to 1 decimal and strip transient fields
    const round = (n:number) => Math.round(n*10)/10;
    return fs.map((f) => ({
      type: 'Feature',
      properties: {
        id: f.properties?.id,
        pitch: f.properties?.pitch,
        edges: Array.isArray(f.properties?.edges) ? f.properties.edges.map(e=>({ i:e.i, type:e.type })) : [],
        accessories: Array.isArray(f.properties?.accessories) ? f.properties.accessories.map((a:any)=> ({ id:a.id, type:a.type, x: round(a.x), y: round(a.y), data: a.data||null })) : [],
        layerId: (f as any).properties?.layerId,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [ (f.geometry?.coordinates?.[0]||[]).map((p:number[])=> [round(p[0]), round(p[1])]) ]
      }
    } as Feature));
  }
  function getLocalSnapKey() { return `measurement:${measurementId}:snapshots`; }
  function addLocalSnapshot(payload: { features: Feature[]; angleDeg?: number }) {
    try {
      const key = getLocalSnapKey();
      const arr = JSON.parse(localStorage.getItem(key)||'[]');
      const rec = { id: 'local:'+Date.now(), createdAt: new Date().toISOString(), payload };
      arr.unshift(rec);
      localStorage.setItem(key, JSON.stringify(arr.slice(0,50))); // keep last 50
    } catch {}
  }
  function listLocalSnapshots() {
    try {
      const key = getLocalSnapKey();
      const arr = JSON.parse(localStorage.getItem(key)||'[]');
      const list = arr.map((r:any)=> ({ id: r.id, name: null, createdAt: r.createdAt }));
      setLocalVersions(list);
    } catch { setLocalVersions([]); }
  }
  async function loadLocalSnapshot(id:string) {
    try {
      const arr = JSON.parse(localStorage.getItem(getLocalSnapKey())||'[]');
      const rec = arr.find((r:any)=> r.id===id);
      if (!rec) return;
      const payload = rec.payload || {};
      if (Array.isArray(payload.features)) {
        setFeatures(payload.features);
        if (typeof payload.angleDeg==='number') setAngleDeg(payload.angleDeg);
        // recompute totals
        try {
          const res2 = await fetch(`/api/measurements/${measurementId}/recompute`, { method: 'POST', body: JSON.stringify({ features: payload.features }) });
          const d2 = await res2.json();
          const fc = JSON.parse(d2?.geojson || '{}');
          const edgeTotalsFt = fc?.properties?.edgeTotalsFt || null;
          const accessoryTotals = fc?.properties?.accessoryTotals || null;
          const totalSquares = typeof d2?.totalSquares === 'number' ? d2.totalSquares : null;
          const totalPerimeterFt = typeof d2?.totalPerimeterFt === 'number' ? d2.totalPerimeterFt : null;
          setTotals({ edgeTotalsFt, accessoryTotals, totalSquares, totalPerimeterFt });
        } catch {}
        setLoadOpen(false);
      }
    } catch {}
  }

  function addLayer() {
    setLayers(prev => {
      const nextIndex = prev.length; // 0=>A,1=>B...
      const letter = String.fromCharCode(65 + nextIndex);
      const newLayer: Layer = { id: letter, name: letter, order: nextIndex };
      const updated = [...prev, newLayer];
      setActiveLayerId(newLayer.id);
      return updated;
    });
  }
  function moveLayer(delta: number) {
    if (!activeLayerId) return;
    setLayers(prev => {
      const idx = prev.findIndex(l => l.id === activeLayerId);
      if (idx < 0) return prev;
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [m] = copy.splice(idx,1);
      copy.splice(target,0,m);
      return copy.map((l,i)=>({ ...l, order: i }));
    });
  }

  // Derived accessory breakdown (per type per distinct value counts)
  const accessoryBreakdown = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    features.forEach(f => {
      const accs: any[] = (f as any).properties?.accessories || [];
      accs.forEach(acc => {
        let key = acc.type;
        let values: string[] = [];
        if (acc.type === 'Skylight') {
          if (acc.data?.size) values = [acc.data.size.toUpperCase()];
        } else if (acc.type === 'Vents') {
          if (Array.isArray(acc.data?.options)) values = acc.data.options.map((o:string)=>o);
        } else if (acc.type === 'Pipe flange') {
          if (acc.data?.size) values = [acc.data.size];
        } else if (acc.type === 'Other') {
          if (acc.data?.note) values = [acc.data.note];
        } else {
          values = [acc.type];
        }
        if (!map[key]) map[key] = {};
        if (values.length === 0) {
          if (!map[key]['(blank)']) map[key]['(blank)'] = 0;
          map[key]['(blank)'] += 1;
        } else {
          values.forEach(v => {
            if (!map[key][v]) map[key][v] = 0;
            map[key][v] += 1;
          });
        }
      });
    });
    return map;
  }, [features]);

  function addAccessory(fi: number, x: number, y: number, type: string) {
    // Create placeholder accessory with default draft values; open inline editor
    let data: any = {};
    if (type === 'Skylight') data = { size: 'M08' };
    else if (type === 'Vents') data = { options: [] as string[] };
    else if (type === 'Pipe flange') data = { size: '1"-2"' };
    else if (type === 'Other') data = { note: '' };
    setFeatures(prev => prev.map((f, idx) => {
      if (idx !== fi) return f;
      const accs = Array.isArray(f.properties.accessories) ? [...f.properties.accessories] : [];
      accs.push({ id: 'A'+Date.now()+Math.random().toString(36).slice(2,6), type, x, y, data });
      return { ...f, properties: { ...f.properties, accessories: accs } };
    }));
    // After state update, capture the new accessory id for editing
    const newId = 'A'+Date.now(); // temporary id for immediate reference won't match actual; we will locate by closest coordinates
    requestAnimationFrame(() => {
      setFeatures(prev => prev.map((f, idx) => {
        if (idx !== fi) return f;
        const accs = Array.isArray(f.properties.accessories)? f.properties.accessories: [];
        // pick last accessory (just added)
        const last = accs[accs.length-1];
        if (last) {
          setEditingAccessory({ fi, accId: last.id });
          setAccessoryDraft(JSON.parse(JSON.stringify(last.data||{})));
        }
        return f;
      }));
    });
  }
  function updateAccessoryPosition(fi: number, accId: string, x: number, y: number) {
    setFeatures(prev => prev.map((f, idx) => {
      if (idx !== fi) return f;
      const accs = Array.isArray(f.properties.accessories) ? f.properties.accessories.map(a => a.id===accId ? { ...a, x, y } : a) : [];
      return { ...f, properties: { ...f.properties, accessories: accs } };
    }));
  }
  function updateAccessoryData(fi: number, accId: string, data: any) {
    setFeatures(prev => prev.map((f, idx) => {
      if (idx !== fi) return f;
      const accs = Array.isArray(f.properties.accessories) ? f.properties.accessories.map(a => a.id===accId ? { ...a, data } : a) : [];
      return { ...f, properties: { ...f.properties, accessories: accs } };
    }));
  }
  function removeAccessory(fi: number, accId: string) {
    setFeatures(prev => prev.map((f, idx) => {
      if (idx !== fi) return f;
      const accs = Array.isArray(f.properties.accessories) ? f.properties.accessories.filter(a => a.id!==accId) : [];
      return { ...f, properties: { ...f.properties, accessories: accs } };
    }));
  }

  const svgToWorld = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    const g = groupRef.current;
    if (!svg || !g) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = g.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const inv = m.inverse();
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  };

  // Convert a point from rotated group (world) coords to outer SVG user coords via screen space
  const worldToOuter = (pt: { x: number; y: number }) => {
    const svg = svgRef.current;
    const g = groupRef.current;
    if (!svg || !g) return pt;
    const ptGroup = svg.createSVGPoint();
    ptGroup.x = pt.x;
    ptGroup.y = pt.y;
    const gToScreen = g.getScreenCTM();
    const svgToScreen = svg.getScreenCTM();
    if (!gToScreen || !svgToScreen) return pt;
    // First: group -> screen
    const inScreen = ptGroup.matrixTransform(gToScreen);
    // Then: screen -> svg user space
    const screenToSvg = svgToScreen.inverse();
    const inSvg = (svg as any).createSVGPoint ? (svg as any).createSVGPoint() : ptGroup;
    inSvg.x = inScreen.x;
    inSvg.y = inScreen.y;
    const out = inSvg.matrixTransform(screenToSvg);
    return { x: out.x, y: out.y };
  };

  const onMouseDown = (fi: number, pi: number) => (_e: React.MouseEvent) => {
    setDrag({ fi, pi });
  };

  function distance(a: {x:number;y:number}, b: {x:number;y:number}) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function nearestVertex(x: number, y: number, tol = 10) {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const f of features) {
      const ring = f.geometry.coordinates[0];
      for (const p of ring) {
        const d = Math.hypot(x - p[0], y - p[1]);
        if (d < bestD && d <= tol) {
          bestD = d;
          best = { x: p[0], y: p[1] };
        }
      }
    }
    if (drawing) {
      for (const p of drawing.points) {
        const d = Math.hypot(x - p[0], y - p[1]);
        if (d < bestD && d <= tol) {
          bestD = d;
          best = { x: p[0], y: p[1] };
        }
      }
    }
    return best;
  }

  function nearestVertexInfo(x: number, y: number, tol = 10): { x: number; y: number; fi: number; vi: number } | null {
    let best: { x: number; y: number; fi: number; vi: number } | null = null;
    let bestD = Infinity;
    features.forEach((f, fi) => {
      const ring = f.geometry.coordinates[0];
      for (let vi = 0; vi < ring.length; vi++) {
        const p = ring[vi];
        const d = Math.hypot(x - p[0], y - p[1]);
        if (d < bestD && d <= tol) {
          bestD = d;
          best = { x: p[0], y: p[1], fi, vi };
        }
      }
    });
    return best;
  }

  function nearestSegmentProjection(x: number, y: number, tol = 8): { x:number; y:number } | null {
    // Returns projection onto any segment if within tol
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    function checkRing(ring: number[][]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const ax = a[0], ay = a[1];
        const bx = b[0], by = b[1];
        const abx = bx - ax, aby = by - ay;
        const apx = x - ax, apy = y - ay;
        const ab2 = abx * abx + aby * aby;
        const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
        const px = ax + t * abx;
        const py = ay + t * aby;
        const d = Math.hypot(x - px, y - py);
        if (d < bestD && d <= tol) {
          bestD = d;
          best = { x: px, y: py };
        }
      }
    }
    for (const f of features) checkRing(f.geometry.coordinates[0]);
    if (drawing && drawing.points.length > 1) checkRing(drawing.points);
    return best;
  }

  function nearestSegmentInfo(x: number, y: number): SegmentInfo {
    let best: SegmentInfo = null;
    let bestD = Infinity;
    features.forEach((f, fi) => {
      const ring = f.geometry.coordinates[0];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const ax = a[0], ay = a[1];
        const bx = b[0], by = b[1];
        const abx = bx - ax, aby = by - ay;
        const apx = x - ax, apy = y - ay;
        const ab2 = abx * abx + aby * aby || 1;
        const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
        const px = ax + t * abx;
        const py = ay + t * aby;
        const d = Math.hypot(x - px, y - py);
        if (d < bestD) {
          bestD = d;
          best = { fi, ei: i, dist: d, proj: { x: px, y: py }, a: a.slice(), b: b.slice() };
        }
      }
    });
    return best;
  }

  function pointInPolygon(x: number, y: number, ring: number[][]) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Helper: check if point lies on segment (with small tolerance)
  function pointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number, tol = 1e-6) {
    const abx = bx - ax, aby = by - ay;
    const apx = px - ax, apy = py - ay;
    const ab2 = abx*abx + aby*aby;
    const dot = apx*abx + apy*aby;
    if (dot < -tol || dot > ab2 + tol) return false;
    const cross = Math.abs(apx*aby - apy*abx);
    return cross <= tol * Math.sqrt(ab2 + tol);
  }

  function segmentsIntersect(a1:[number,number], a2:[number,number], b1:[number,number], b2:[number,number]) {
    // Standard orientation test, but treat collinear overlapping as intersection (handled separately for shared edge allowance)
    const o = (p:[number,number], q:[number,number], r:[number,number]) => {
      return (q[1]-p[1])*(r[0]-q[0]) - (q[0]-p[0])*(r[1]-q[1]);
    };
    const onSeg = (p:[number,number], q:[number,number], r:[number,number]) => {
      return Math.min(p[0],r[0]) - 1e-9 <= q[0] && q[0] <= Math.max(p[0],r[0]) + 1e-9 && Math.min(p[1],r[1]) - 1e-9 <= q[1] && q[1] <= Math.max(p[1],r[1]) + 1e-9;
    };
    const o1 = o(a1,a2,b1);
    const o2 = o(a1,a2,b2);
    const o3 = o(b1,b2,a1);
    const o4 = o(b1,b2,a2);
    // Treat pure endpoint touching as non-intersection so polygons can meet at corners
    const endpointTouch = (p:[number,number], q:[number,number]) => Math.hypot(p[0]-q[0], p[1]-q[1]) < 1e-6;
    if (endpointTouch(a1,b1) || endpointTouch(a1,b2) || endpointTouch(a2,b1) || endpointTouch(a2,b2)) {
      // Corner contact allowed
    } else {
      if (o1 === 0 && onSeg(a1,b1,a2)) return true;
      if (o2 === 0 && onSeg(a1,b2,a2)) return true;
      if (o3 === 0 && onSeg(b1,a1,b2)) return true;
      if (o4 === 0 && onSeg(b1,a2,b2)) return true;
    }
    return (o1>0)!==(o2>0) && (o3>0)!==(o4>0);
  }

  // Check if a segment from a->b would cross any polygon edges on the same layer
  function segmentCrossesSameLayer(a: [number,number], b: [number,number], layerId: string) {
    const endpointTouch = (p:[number,number], q:[number,number]) => Math.hypot(p[0]-q[0], p[1]-q[1]) < 1e-6;
    for (const f of features) {
      if (f.properties?.layerId !== layerId) continue;
      const other = f.geometry.coordinates[0] as number[][];
      for (let j=0;j<other.length;j++) {
        const c1 = other[j] as [number,number];
        const c2 = other[(j+1)%other.length] as [number,number];
        if (segmentsIntersect(a,b,c1,c2)) {
          const collinear = Math.abs((b[0]-a[0])*(c2[1]-c1[1]) - (b[1]-a[1])*(c2[0]-c1[0])) < 1e-4;
          if (collinear) continue; // allow tracing along shared edges
          if (endpointTouch(a,c1)||endpointTouch(a,c2)||endpointTouch(b,c1)||endpointTouch(b,c2)) continue; // allow endpoint touches
          return true; // true crossing
        }
      }
    }
    return false;
  }

  // Check if proposed polygon (ring) overlaps an existing same-layer polygon beyond shared edges.
  function polygonOverlapsSameLayer(ring: number[][], layerId: string) {
    // Allow shared edges & vertices. Only block if: any non-collinear edge crossing, or one centroid lies strictly inside another.
    function centroid(poly: number[][]) {
      let x=0,y=0,a=0; for (let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];const f=p[0]*q[1]-q[0]*p[1];x+=(p[0]+q[0])*f;y+=(p[1]+q[1])*f;a+=f;} a*=0.5; if (Math.abs(a)<1e-9) return {x:poly[0][0],y:poly[0][1]}; return {x:x/(6*a), y:y/(6*a)};
    }
    for (const f of features) {
      if (f.properties?.layerId !== layerId) continue;
      const other = f.geometry.coordinates[0] as number[][];
      // Edge crossing (exclude collinear or endpoint touches)
      for (let i=0;i<ring.length;i++) {
        const a1 = ring[i];
        const a2 = ring[(i+1)%ring.length];
        for (let j=0;j<other.length;j++) {
          const b1 = other[j];
          const b2 = other[(j+1)%other.length];
          if (segmentsIntersect(a1 as any,a2 as any,b1 as any,b2 as any)) {
            const collinear = Math.abs((a2[0]-a1[0])*(b2[1]-b1[1]) - (a2[1]-a1[1])*(b2[0]-b1[0])) < 1e-4;
            if (!collinear) return true;
          }
        }
      }
      // If there is any boundary contact (shared edge or vertex), allow adjacency
      let boundaryContact = false;
      // vertices of ring lying on edges of other
      for (const p of ring) {
        for (let j=0;j<other.length;j++) {
          const q1 = other[j];
          const q2 = other[(j+1)%other.length];
          if (pointOnSegment(p[0],p[1], q1[0],q1[1], q2[0],q2[1], 1e-3)) { boundaryContact = true; break; }
        }
        if (boundaryContact) break;
      }
      // vertices of other lying on edges of ring
      if (!boundaryContact) {
        for (const p of other) {
          for (let j=0;j<ring.length;j++) {
            const q1 = ring[j];
            const q2 = ring[(j+1)%ring.length];
            if (pointOnSegment(p[0],p[1], q1[0],q1[1], q2[0],q2[1], 1e-3)) { boundaryContact = true; break; }
          }
          if (boundaryContact) break;
        }
      }
      // Centroid containment (strict) check, but ignore if they merely touch on boundary
      const cNew = centroid(ring);
      const cOther = centroid(other);
      if (!boundaryContact && pointInPolygon(cNew.x, cNew.y, other)) return true;
      if (!boundaryContact && pointInPolygon(cOther.x, cOther.y, ring)) return true;
    }
    return false;
  }

  function axisAlign(x: number, y: number, tolScreenPx = 12) {
    // Favor keeping segments parallel/perpendicular to existing edges, then axis locks, then grid
    let sx = x, sy = y;
    const svg = svgRef.current;
    let tolX = 8, tolY = 8;
    if (svg && viewBox) {
      const cw = svg.clientWidth || (svg.getBoundingClientRect().width || 1);
      const ch = svg.clientHeight || (svg.getBoundingClientRect().height || 1);
      tolX = (viewBox.w / cw) * tolScreenPx;
      tolY = (viewBox.h / ch) * tolScreenPx;
    }
    const tolLine = Math.max(tolX, tolY);

    // Helper: project point p onto line through anchor a in direction dir
    function projectToLine(px: number, py: number, a: { x: number; y: number }, dir: { x: number; y: number }) {
      const len = Math.hypot(dir.x, dir.y) || 1;
      const ux = dir.x / len, uy = dir.y / len;
      const apx = px - a.x, apy = py - a.y;
      const t = apx * ux + apy * uy;
      return { x: a.x + t * ux, y: a.y + t * uy };
    }

    // 1) Parallel/perpendicular to existing segment directions (anchored at last point)
    let snappedToOrientation = false;
    if (drawing && drawing.points.length > 0) {
      const last = { x: drawing.points[drawing.points.length - 1][0], y: drawing.points[drawing.points.length - 1][1] };
      // Collect candidate directions: last segment first, then all existing edges (features + current drawing)
      const dirs: { x: number; y: number }[] = [];
      if (drawing.points.length > 1) {
        const prev = drawing.points[drawing.points.length - 2];
        dirs.push({ x: last.x - prev[0], y: last.y - prev[1] });
      }
      const addDirsFromRing = (ring: number[][]) => {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          dirs.push({ x: b[0] - a[0], y: b[1] - a[1] });
        }
      };
      for (const f of features) addDirsFromRing(f.geometry.coordinates[0]);
      if (drawing.points.length > 1) addDirsFromRing(drawing.points);

      // Deduplicate directions by angle modulo 90°
      const unique: { x: number; y: number }[] = [];
      const seen: number[] = [];
      for (const d of dirs) {
        const len = Math.hypot(d.x, d.y);
        if (len < 1e-6) continue;
        const ang = Math.atan2(d.y, d.x);
        // Normalize angle to [0, PI/2)
        let key = ang % (Math.PI / 2);
        if (key < 0) key += Math.PI / 2;
        // bucket to ~5 degrees
        const bucket = Math.round((key / (Math.PI / 2)) * 18); // 90° / 5° = 18 buckets
        if (seen.includes(bucket)) continue;
        seen.push(bucket);
        unique.push(d);
        if (unique.length > 24) break; // guard
      }

      // Try snapping to nearest line among each direction and its perpendicular
      let best: { x: number; y: number; d: number } | null = null;
      for (const d of unique) {
        const cand1 = projectToLine(x, y, last, d);
        const d1 = Math.hypot(cand1.x - x, cand1.y - y);
        if (!best || d1 < best.d) best = { x: cand1.x, y: cand1.y, d: d1 };
        // perpendicular: rotate 90°
        const perp = { x: -d.y, y: d.x };
        const cand2 = projectToLine(x, y, last, perp);
        const d2 = Math.hypot(cand2.x - x, cand2.y - y);
        if (!best || d2 < best.d) best = { x: cand2.x, y: cand2.y, d: d2 };
      }
      if (best && best.d <= tolLine) {
        sx = best.x; sy = best.y; snappedToOrientation = true;
      }
    }

    // 2) Lock to last placed point axes (only if not already snapped by orientation)
    if (!snappedToOrientation && drawing && drawing.points.length > 0) {
      const last = drawing.points[drawing.points.length - 1];
      if (Math.abs(x - last[0]) <= tolX) sx = last[0];
      if (Math.abs(y - last[1]) <= tolY) sy = last[1];
    }

    // 3) Lock to any existing vertex axes across the canvas
    if (!snappedToOrientation) {
      const vertices: { x: number; y: number }[] = [];
      for (const f of features) for (const p of f.geometry.coordinates[0]) vertices.push({ x: p[0], y: p[1] });
      if (drawing) for (const p of drawing.points) vertices.push({ x: p[0], y: p[1] });
      for (const v of vertices) {
        if (Math.abs(x - v.x) <= tolX) sx = v.x;
        if (Math.abs(y - v.y) <= tolY) sy = v.y;
      }
    }

    // 4) Grid as a gentle fallback
    if (svg && viewBox) {
      const spacing = 25; // keep consistent with grid density
      const gx = Math.round(x / spacing) * spacing;
      const gy = Math.round(y / spacing) * spacing;
      if (Math.abs(x - gx) <= tolX * 0.75) sx = gx;
      if (Math.abs(y - gy) <= tolY * 0.75) sy = gy;
    }
    return { x: sx, y: sy };
  }

  function snapPoint(x: number, y: number) {
    // Priority: vertex -> segment -> axis align
    // Use pixel-based tolerance for vertex snapping so you can get closer without snapping
    let tolWorld = 10;
    const svg = svgRef.current;
    if (svg && viewBox) {
      const rect = svg.getBoundingClientRect();
      const cw = svg.clientWidth || rect.width || 1;
  tolWorld = (viewBox.w / cw) * VERTEX_SNAP_PX;
    }
  const v = nearestVertex(x, y, tolWorld);
  if (v) { setSnapHighlight({x:v.x,y:v.y}); return v; }
  const s = nearestSegmentProjection(x, y);
  if (s) { const segPt = s as {x:number;y:number}; setSnapHighlight({x:segPt.x,y:segPt.y}); return segPt; }
  setSnapHighlight(null);
  return axisAlign(x, y, SNAP_PX);
  }

  const onMouseMove = (e: React.MouseEvent) => {
    const { x, y } = svgToWorld(e);
    if (dragAccessory) {
      updateAccessoryPosition(dragAccessory.fi, dragAccessory.accId, x, y);
      return;
    }
    // Whole polygon dragging
    if (polyDrag) {
      const dx = x - polyDrag.start.x;
      const dy = y - polyDrag.start.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) polyDragStartedRef.current = true;
      setFeatures(prev => prev.map((f, idx) => {
        if (idx !== polyDrag.fi) return f;
        const moved = polyDrag.base.map(p => [p[0] + dx, p[1] + dy]);
        return { ...f, geometry: { type: 'Polygon', coordinates: [moved] } } as any;
      }));
      return;
    }
    // If left-pan is pending, start panning only after a tiny movement threshold
    if (leftPanPending && panStart && viewBox) {
      const dxPx = Math.abs(e.clientX - panStart.cx);
      const dyPx = Math.abs(e.clientY - panStart.cy);
      if (dxPx > 3 || dyPx > 3) {
        setIsPanning(true);
        suppressClickRef.current = true; // prevent click after a real pan drag
      }
    }
    if (isPanning && panStart && viewBox) {
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      const cw = svg.clientWidth || rect.width || 1;
      const ch = svg.clientHeight || rect.height || 1;
      const dxPx = e.clientX - panStart.cx;
      const dyPx = e.clientY - panStart.cy;
  // No click suppression after panning anymore
      const dx = (panStart.vb.w / cw) * dxPx;
      const dy = (panStart.vb.h / ch) * dyPx;
      const fullW = size.w, fullH = size.h;
      const nx = Math.max(0, Math.min(fullW - panStart.vb.w, panStart.vb.x - dx));
      const ny = Math.max(0, Math.min(fullH - panStart.vb.h, panStart.vb.y - dy));
      setViewBox({ ...panStart.vb, x: nx, y: ny });
    } else if (drag) {
      const sp = snapPoint(x, y);
      setFeatures((prev) =>
        prev.map((f, idx) => {
          if (idx !== drag.fi) return f;
          const ring = f.geometry.coordinates[0].map((p: number[], j: number) =>
            j === drag.pi ? [sp.x, sp.y] : p
          );
          return { ...f, geometry: { type: "Polygon", coordinates: [ring] } };
        })
      );
  } else if (drawing) {
      const sp = snapPoint(x, y);
      setHoverPt(sp);
  } else if (mode === 'pitch') {
      setHoverPt({ x, y });
    }
  };

  const onMouseUp = () => setDrag(null);

  function startDrawPolygon() {
    setDrawing({ points: [], refs: [] });
    setHoverPt(null);
  }

  function cancelDraw() {
    setDrawing(null);
    setHoverPt(null);
  }

  function finishDraw() {
    if (!drawing) return;
    const pts = drawing.points.slice();
    const refs = drawing.refs.slice();
    if (pts.length < 3) {
      cancelDraw();
      return;
    }
    // Minimal area guard (ignore degenerate sliver/line polygons)
    const rawArea = Math.abs(polygonAreaPx2(pts as any));
    if (rawArea < 1e-2) { // too small / line
      cancelDraw();
      return;
    }
    // If starting and ending points snapped to vertices of the same existing feature,
    // auto-complete along that ring between last and first to share that edge.
    const firstRef = refs[0];
    let lastRef = refs[refs.length - 1];
    // If the last point is a projection (null ref) but we're likely closing onto the same feature as start,
    // try to infer the nearest vertex on that feature and snap to it before auto-completing.
    if (firstRef && (!lastRef || lastRef.fi !== firstRef.fi)) {
      try {
        const svg = svgRef.current;
        const cw = svg?.clientWidth || svg?.getBoundingClientRect().width || 1;
  const tolWorld = viewBox ? (viewBox.w / cw) * Math.max(6, VERTEX_SNAP_PX) : 10;
        const ringF = features[firstRef.fi].geometry.coordinates[0] as number[][];
        const lp = pts[pts.length - 1];
        let bestVi = -1; let bestD = Infinity;
        for (let vi = 0; vi < ringF.length; vi++) {
          const p = ringF[vi];
          const d = Math.hypot(lp[0] - p[0], lp[1] - p[1]);
          if (d < bestD) { bestD = d; bestVi = vi; }
        }
        if (bestVi >= 0 && bestD <= tolWorld) {
          // Snap last point to that vertex and mark ref
          pts[pts.length - 1] = [ringF[bestVi][0], ringF[bestVi][1]];
          lastRef = { fi: firstRef.fi, vi: bestVi } as any;
          refs[refs.length - 1] = lastRef as any;
        }
      } catch {}
    }
    if (firstRef && lastRef && firstRef.fi === lastRef.fi && firstRef.vi !== lastRef.vi) {
      const ring = features[firstRef.fi].geometry.coordinates[0];
      const n = ring.length;
      const fvi = firstRef.vi;
      const lvi = lastRef.vi;
      const walk = (start: number, end: number, dir: 1 | -1) => {
        const seq: number[] = [];
        let i = start;
        while (true) {
          i = (i + dir + n) % n;
          if (i === end) break;
          seq.push(i);
        }
        return seq;
      };
      const forward = walk(lvi, fvi, 1);
      const backward = walk(lvi, fvi, -1);
      const chosen = forward.length <= backward.length ? forward : backward;
      for (const vi of chosen) {
        const p = ring[vi];
        pts.push([p[0], p[1]]);
        refs.push({ fi: firstRef.fi, vi });
      }
    }
    // Prevent creating polygon overlapping an existing same-layer polygon (allow shared edges)
  const layerId = activeLayerId;
    // If there is boundary contact with any same-layer polygon, allow as long as there are no true crossings.
    let hasBoundaryContactAny = false;
    for (const f of features) {
      if (f.properties?.layerId !== layerId) continue;
      const other = f.geometry.coordinates[0] as number[][];
      // ring vertices on other's edges
      for (const p of pts) {
        for (let j=0;j<other.length;j++) {
          const q1 = other[j];
          const q2 = other[(j+1)%other.length];
          if (pointOnSegment(p[0],p[1], q1[0],q1[1], q2[0],q2[1], 1e-3)) { hasBoundaryContactAny = true; break; }
        }
        if (hasBoundaryContactAny) break;
      }
      if (!hasBoundaryContactAny) {
        // other's vertices on ring edges
        for (const p of other) {
          for (let j=0;j<pts.length;j++) {
            const q1 = pts[j];
            const q2 = pts[(j+1)%pts.length];
            if (pointOnSegment(p[0],p[1], q1[0],q1[1], q2[0],q2[1], 1e-3)) { hasBoundaryContactAny = true; break; }
          }
          if (hasBoundaryContactAny) break;
        }
      }
      if (hasBoundaryContactAny) break;
    }
  if (hasBoundaryContactAny) {
      // ensure no true crossings with any same-layer polygon edges
      const endpointTouch = (p:[number,number], q:[number,number]) => Math.hypot(p[0]-q[0], p[1]-q[1]) < 1e-6;
      const crosses = (() => {
        for (const f of features) {
          if (f.properties?.layerId !== layerId) continue;
          const other = f.geometry.coordinates[0] as number[][];
          for (let i=0;i<pts.length;i++) {
            const a1 = pts[i] as [number,number];
            const a2 = pts[(i+1)%pts.length] as [number,number];
            for (let j=0;j<other.length;j++) {
              const b1 = other[j] as [number,number];
              const b2 = other[(j+1)%other.length] as [number,number];
              if (segmentsIntersect(a1,a2,b1,b2)) {
                const collinear = Math.abs((a2[0]-a1[0])*(b2[1]-b1[1]) - (a2[1]-a1[1])*(b2[0]-b1[0])) < 1e-4;
                if (collinear) continue;
                if (endpointTouch(a1,b1)||endpointTouch(a1,b2)||endpointTouch(a2,b1)||endpointTouch(a2,b2)) continue;
                return true;
              }
            }
          }
        }
        return false;
      })();
      if (crosses) return; // reject
    } else {
      if (polygonOverlapsSameLayer(pts, layerId)) {
        // Reject finish; could flash or notify later
        return;
      }
    }
    // Final guard: ensure no new edges cross any existing same-layer polygon edges
    for (let i=0;i<pts.length;i++) {
      const a1 = pts[i] as [number,number];
      const a2 = pts[(i+1)%pts.length] as [number,number];
      if (segmentCrossesSameLayer(a1, a2, layerId)) return;
    }
    const id = `U${Date.now()}`;
    const edges = pts.map((_, i) => ({ i, type: "unknown" as EdgeType }));
    const feat: Feature = {
      type: "Feature",
  properties: { id, pitch: defaultPitchIn12, edges, layerId: activeLayerId },
      geometry: { type: "Polygon", coordinates: [pts] },
    } as any;
    setFeatures((prev) => [...prev, feat]);
    setDrawing(null);
    setHoverPt(null);
  }

  function undoLastDrawPoint() {
    if (!drawing) return;
    const pts = drawing.points.slice(0, -1);
    const refs = drawing.refs.slice(0, -1);
    if (pts.length === 0) {
      cancelDraw();
    } else {
      setDrawing({ points: pts, refs });
    }
  }

  const onSvgClick = (e: React.MouseEvent) => {
  // Suppress the click if it immediately follows a pan gesture
  if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    // Only respond to primary button clicks
    if (e.button !== 0) return;
  // No suppression of clicks after panning
  const { x, y } = svgToWorld(e);
  const svg = svgRef.current;
    if (!svg) return;
  const rect = svg.getBoundingClientRect();
    // Deselect on background single-click in draw mode when not drawing
    if (mode === 'draw' && !drawing) {
      let insideAny = false;
      for (const f of features) {
        if (f.properties?.layerId !== activeLayerId) continue;
        const ring = f.geometry.coordinates[0] as number[][];
        if (pointInPolygon(x, y, ring)) { insideAny = true; break; }
      }
      if (!insideAny && selectedFi != null) { setSelectedFi(null); return; }
    }
    // Label mode: assign nearest edge with a tolerant hitbox
    if (mode === 'label') {
      if (!viewBox) return;
      const tolPx = 18; // more forgiving
      const tolWorld = (viewBox.w / (svg.clientWidth || rect.width || 1)) * tolPx;
      const near: SegmentInfo = nearestSegmentInfo(x, y);
      if (near && near.dist <= tolWorld) {
        const f = features[near.fi];
        if (f.properties?.layerId === activeLayerId) setEdgeType(near.fi, near.ei, activeLabel);
      }
      return;
    }
    // Pitch mode: assign pitch to clicked polygon
    if (mode === 'pitch') {
      let targetFi: number | null = null;
      features.forEach((f, fi) => {
        if (pointInPolygon(x, y, f.geometry.coordinates[0])) {
          if (f.properties?.layerId === activeLayerId) targetFi = fi;
        }
      });
      if (targetFi != null) updatePitch(targetFi, pitchValue);
      return;
    }
    // Drawing interactions
    if (mode !== 'draw') return;
    // If not currently drawing, start a new polygon at the snapped point
    if (!drawing) {
      // Prefer snapping to existing vertex (tight pixel tolerance), then segment endpoints/projection, else axis aligned snap
      const cw = svg.clientWidth || rect.width || 1;
  const vTolWorldStart = viewBox ? (viewBox.w / cw) * VERTEX_SNAP_PX : 10;
      const vinfo = nearestVertexInfo(x, y, vTolWorldStart);
      if (vinfo) {
        setDrawing({ points: [[vinfo.x, vinfo.y]], refs: [{ fi: vinfo.fi, vi: vinfo.vi }] });
        return;
      }
      const near0: SegmentInfo = nearestSegmentInfo(x, y);
      if (near0) {
        const tolPx = 10;
        const tolWorld = viewBox ? (viewBox.w / (svg.clientWidth || rect.width || 1)) * tolPx : 10;
        if (near0.dist <= tolWorld) {
          const da = Math.hypot(near0.a[0] - x, near0.a[1] - y);
          const db = Math.hypot(near0.b[0] - x, near0.b[1] - y);
          const chosen = da <= db ? near0.a : near0.b;
          const chosenVi = da <= db ? near0.ei : (near0.ei + 1) % features[near0.fi].geometry.coordinates[0].length;
          setDrawing({ points: [[chosen[0], chosen[1]]], refs: [{ fi: near0.fi, vi: chosenVi }] });
          return;
        }
      }
  const sp0 = axisAlign(x, y, SNAP_PX);
      // Block starting inside an existing polygon on the same layer (allow boundary touches)
      {
        const targetLayerId = activeLayerId;
        for (const f of features) {
          if (f.properties?.layerId !== targetLayerId) continue;
          const ring = f.geometry.coordinates[0] as number[][];
          if (pointInPolygon(sp0.x, sp0.y, ring)) {
            let onBoundary = false;
            const cwB = svg.clientWidth || rect.width || 1;
            const boundTol = viewBox ? (viewBox.w / cwB) * Math.max(2, VERTEX_SNAP_PX/2) : 2;
            for (let i=0;i<ring.length;i++) {
              const a = ring[i];
              const b = ring[(i+1)%ring.length];
              if (pointOnSegment(sp0.x, sp0.y, a[0],a[1], b[0],b[1], boundTol)) { onBoundary = true; break; }
            }
            if (!onBoundary) return; // don't start drawing inside same-layer polygon
          }
        }
      }
      setDrawing({ points: [[sp0.x, sp0.y]], refs: [null] });
      return;
    }
    const pts = drawing.points;
  // Vertex snap first (tight pixel tolerance)
  const cw2 = svg.clientWidth || rect.width || 1;
  const vTolWorld = viewBox ? (viewBox.w / cw2) * VERTEX_SNAP_PX : 10;
  const vinfo = nearestVertexInfo(x, y, vTolWorld);
    if (vinfo) {
      if (pts.length >= 3) {
        const first = { x: pts[0][0], y: pts[0][1] };
        const closeTol = viewBox ? (viewBox.w / (svg.clientWidth || rect.width || 1)) * VERTEX_SNAP_PX : 10;
        if (distance({ x: vinfo.x, y: vinfo.y }, first) <= closeTol) { finishDraw(); return; }
      }
      const last = pts[pts.length - 1];
      if (!last || (!segmentCrossesSameLayer([last[0], last[1]], [vinfo.x, vinfo.y], activeLayerId) && Math.hypot(vinfo.x - last[0], vinfo.y - last[1]) >= 1)) {
        const newPoints = [...pts, [vinfo.x, vinfo.y]];
        const newRefs = [...(drawing?.refs||[]), { fi: vinfo.fi, vi: vinfo.vi }];
        setDrawing({ points: newPoints, refs: newRefs });
  // Allow placing multiple points along the same shared ring; do not auto-close here.
      }
      return;
    }
    // Segment sharing: stick to shared lines and endpoints when close
  const near: SegmentInfo = nearestSegmentInfo(x, y);
    if (near) {
      const tolPx = 10;
      const tolWorld = viewBox ? (viewBox.w / (svg.clientWidth || rect.width || 1)) * tolPx : 10;
      if (near.dist <= tolWorld) {
        const last = pts[pts.length - 1];
        if (!last) {
          // start exactly at the closer endpoint
          const da = Math.hypot(near.a[0] - x, near.a[1] - y);
          const db = Math.hypot(near.b[0] - x, near.b[1] - y);
          const chosen = da <= db ? near.a : near.b;
          const chosenVi = da <= db ? near.ei : (near.ei + 1) % features[near.fi].geometry.coordinates[0].length;
          setDrawing({ points: [[chosen[0], chosen[1]]], refs: [{ fi: near.fi, vi: chosenVi }] });
          return;
        }
        const lastProjDist = Math.hypot(near.proj.x - last[0], near.proj.y - last[1]);
          if (lastProjDist <= tolWorld) {
            const da = Math.hypot(near.a[0] - last[0], near.a[1] - last[1]);
            const db = Math.hypot(near.b[0] - last[0], near.b[1] - last[1]);
            const chosen = da > db ? near.a : near.b; // extend toward far endpoint
            if (!segmentCrossesSameLayer([last[0], last[1]], [chosen[0], chosen[1]], activeLayerId) && Math.hypot(chosen[0] - last[0], chosen[1] - last[1]) >= 1) {
              const chosenVi = da > db ? near.ei : (near.ei + 1) % features[near.fi].geometry.coordinates[0].length;
              const newPoints = [...pts, [chosen[0], chosen[1]]];
              const newRefs = [...(drawing?.refs||[]), { fi: near.fi, vi: chosenVi }];
              setDrawing({ points: newPoints, refs: newRefs });
              // Allow continued placement along shared ring without auto-closing.
              return;
            }
        }
        // Else snap onto the segment projection
        const proj = near.proj;
        if (!segmentCrossesSameLayer([last[0], last[1]], [proj.x, proj.y], activeLayerId) && Math.hypot(proj.x - last[0], proj.y - last[1]) >= 1) {
          setDrawing({ points: [...pts, [proj.x, proj.y]], refs: [...(drawing?.refs||[]), null] });
          return;
        }
      }
    }
    // Fallback to axis/grid aligned snapping
  const sp = axisAlign(x, y, SNAP_PX);
    // First, allow closing near the start point using pixel-based tolerance
    if (pts.length >= 3) {
      const cw3 = svg.clientWidth || rect.width || 1;
  const closeTol = viewBox ? (viewBox.w / cw3) * VERTEX_SNAP_PX : 10;
      const first = { x: pts[0][0], y: pts[0][1] };
      if (distance(sp, first) <= closeTol) { finishDraw(); return; }
    }
    // Then reject placing a point that falls strictly inside another polygon on the SAME layer as the polygon being drawn (edges allowed)
    {
  const targetLayerId = activeLayerId;
  if (targetLayerId) {
        for (const f of features) {
          if (f.properties?.layerId !== targetLayerId) continue;
          const ring = f.geometry.coordinates[0] as number[][];
          if (pointInPolygon(sp.x, sp.y, ring)) {
            // Check if on boundary; if not, block
            let onBoundary = false;
            const cwB = svg.clientWidth || rect.width || 1;
            const boundTol = viewBox ? (viewBox.w / cwB) * Math.max(2, VERTEX_SNAP_PX/2) : 2; // ~pixel-based
            for (let i=0;i<ring.length;i++) {
              const a = ring[i];
              const b = ring[(i+1)%ring.length];
              if (pointOnSegment(sp.x, sp.y, a[0],a[1], b[0],b[1], boundTol)) { onBoundary = true; break; }
            }
            if (!onBoundary) return; // block point placement
          }
        }
      }
    }
  const last = pts[pts.length - 1];
  if (!last) {
    setDrawing({ points: [[sp.x, sp.y]], refs: [...(drawing?.refs||[]), null] });
  } else {
    // Block if the line from last to candidate crosses any polygon on the same layer
    const layerId = activeLayerId;
    if (segmentCrossesSameLayer([last[0], last[1]], [sp.x, sp.y], layerId)) return;
    if (Math.hypot(sp.x - last[0], sp.y - last[1]) >= 1) setDrawing({ points: [...pts, [sp.x, sp.y]], refs: [...(drawing?.refs||[]), null] });
  }
  };

  function onSvgMouseDown(e: React.MouseEvent) {
    if (!viewBox) return;
    // Right-click during drawing: undo last point
    if (e.button === 2 && mode === 'draw' && drawing) {
      e.preventDefault();
      undoLastDrawPoint();
      return;
    }
    // Start panning if middle click or space held
    if (e.button === 1 || spaceDown) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ cx: e.clientX, cy: e.clientY, vb: { ...viewBox } });
      setLeftPanPending(false);
      return;
    }
  // Also allow left-click drag panning when not in draw mode OR in draw mode but not actively drawing
  if (e.button === 0 && (mode !== 'draw' || !drawing)) {
      e.preventDefault();
      setLeftPanPending(true);
      setPanStart({ cx: e.clientX, cy: e.clientY, vb: { ...viewBox } });
    }
  }

  function onSvgMouseUp(_e: React.MouseEvent) {
    setIsPanning(false);
    setPanStart(null);
    setLeftPanPending(false);
    if (polyDrag) {
      if (polyDragStartedRef.current) suppressClickRef.current = true;
      setPolyDrag(null);
      polyDragStartedRef.current = false;
    }
  }

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.code === 'Space') { setSpaceDown(true); }
      if (selectedFi != null && (ev.key === 'Backspace' || ev.key === 'Delete')) {
        deletePolygon(selectedFi);
      }
    };
    const onKeyUp = (ev: KeyboardEvent) => { if (ev.code === 'Space') setSpaceDown(false); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [selectedFi, viewBox]);

  // If leaving draw mode, cancel any in-progress drawing
  useEffect(() => {
    if (mode !== 'draw' && drawing) {
      setDrawing(null);
      setHoverPt(null);
    }
  }, [mode, drawing]);

  useEffect(()=>{ const up=()=> setDragAccessory(null); window.addEventListener('mouseup', up); return ()=> window.removeEventListener('mouseup', up); },[]);

  function deletePolygon(index: number) {
    setFeatures(prev => prev.filter((_, i) => i !== index));
    setSelectedFi(null);
  }

  function fitRectangle(fi: number) {
    setFeatures(prev => prev.map((f, idx) => {
      if (idx !== fi) return f;
      const pts = f.geometry.coordinates[0];
      if (pts.length < 3) return f;
      // Compute oriented bounding box via PCA for simplicity
      const meanX = pts.reduce((s,p)=>s+p[0],0)/pts.length;
      const meanY = pts.reduce((s,p)=>s+p[1],0)/pts.length;
      const X = pts.map(p=>[p[0]-meanX, p[1]-meanY]);
      const covXX = X.reduce((s,v)=>s+v[0]*v[0],0)/pts.length;
      const covXY = X.reduce((s,v)=>s+v[0]*v[1],0)/pts.length;
      const covYY = X.reduce((s,v)=>s+v[1]*v[1],0)/pts.length;
      const trace = covXX + covYY;
      const det = covXX*covYY - covXY*covXY;
      const temp = Math.sqrt(Math.max(0, trace*trace - 4*det));
      const eig1 = (trace + temp)/2;
      const vx = covXY;
      const vy = eig1 - covXX;
      const len = Math.hypot(vx, vy) || 1;
      const ux = vx/len, uy = vy/len; // principal axis unit vector
      const vx2 = -uy, vy2 = ux; // orthogonal axis
      // Project points onto axes to get extents
      const proj1 = X.map(v=>v[0]*ux + v[1]*uy);
      const proj2 = X.map(v=>v[0]*vx2 + v[1]*vy2);
      const min1 = Math.min(...proj1), max1 = Math.max(...proj1);
      const min2 = Math.min(...proj2), max2 = Math.max(...proj2);
  const corners = [
        [meanX + min1*ux + min2*vx2, meanY + min1*uy + min2*vy2],
        [meanX + max1*ux + min2*vx2, meanY + max1*uy + min2*vy2],
        [meanX + max1*ux + max2*vx2, meanY + max1*uy + max2*vy2],
        [meanX + min1*ux + max2*vx2, meanY + min1*uy + max2*vy2],
      ];
  const prevEdges = (f.properties?.edges || []) as { i:number; type: EdgeType }[];
  const newEdges = Array.from({length: corners.length}, (_,i)=> ({ i, type: (prevEdges.find(e=>e.i===i)?.type || 'unknown') as EdgeType }));
  return { ...f, properties: { ...f.properties, edges: newEdges }, geometry: { type: 'Polygon', coordinates: [corners] } };
    }));
  }

  function fitTriangle(fi: number) {
    // Quick heuristic: take convex hull and reduce to 3 points by farthest-point sampling
    setFeatures(prev => prev.map((f, idx) => {
      if (idx !== fi) return f;
      const pts = f.geometry.coordinates[0];
      if (pts.length < 3) return f;
      // simple convex hull (Graham scan)
      const points = pts.map(p=>({x:p[0], y:p[1]}));
      points.sort((a,b)=>a.x===b.x? a.y-b.y : a.x-b.x);
      const cross=(o:any,a:any,b:any)=> (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
      const lower:any[]=[]; for(const p of points){ while(lower.length>=2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop(); lower.push(p); }
      const upper:any[]=[]; for(let i=points.length-1;i>=0;i--){const p=points[i]; while(upper.length>=2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop(); upper.push(p);} 
      const hull = lower.slice(0, lower.length-1).concat(upper.slice(0, upper.length-1));
      if (hull.length <= 3) return { ...f, geometry: { type: 'Polygon', coordinates: [hull.map(p=>[p.x,p.y])]} };
      // farthest point sampling to 3 vertices
      let tri = [hull[0], hull[Math.floor(hull.length/3)], hull[Math.floor(2*hull.length/3)]];
      // refine by picking farthest from current triangle iteratively
      for (let iter=0; iter<3; iter++) {
        let best = tri;
        let bestPeri = 0;
        for (let i=0;i<hull.length;i++){
          for(let j=0;j<3;j++){
            const cand = [...tri]; cand[j] = hull[i];
            const peri = Math.hypot(cand[0].x-cand[1].x,cand[0].y-cand[1].y)+Math.hypot(cand[1].x-cand[2].x,cand[1].y-cand[2].y)+Math.hypot(cand[2].x-cand[0].x,cand[2].y-cand[0].y);
            if (peri>bestPeri){bestPeri=peri; best=cand;}
          }
        }
        tri = best;
      }
      const ring = tri.map(p=>[p.x,p.y]);
  const prevEdges = (f.properties?.edges || []) as { i:number; type: EdgeType }[];
  const newEdges = Array.from({length: ring.length}, (_,i)=> ({ i, type: (prevEdges.find(e=>e.i===i)?.type || 'unknown') as EdgeType }));
  return { ...f, properties: { ...f.properties, edges: newEdges }, geometry: { type: 'Polygon', coordinates: [ring] } };
    }));
  }

  function orthogonalize(fi: number) {
    setFeatures(prev => prev.map((f, idx) => {
      if (idx !== fi) return f;
      const pts = f.geometry.coordinates[0];
      if (pts.length < 2) return f;
      // Center and PCA for rotation angle
      const cx = pts.reduce((s,p)=>s+p[0],0)/pts.length;
      const cy = pts.reduce((s,p)=>s+p[1],0)/pts.length;
      const centered = pts.map(p=>[p[0]-cx, p[1]-cy]);
      const covXX = centered.reduce((s,v)=>s+v[0]*v[0],0)/pts.length;
      const covXY = centered.reduce((s,v)=>s+v[0]*v[1],0)/pts.length;
      const covYY = centered.reduce((s,v)=>s+v[1]*v[1],0)/pts.length;
      const trace = covXX + covYY;
      const det = covXX*covYY - covXY*covXY;
      const temp = Math.sqrt(Math.max(0, trace*trace - 4*det));
      const eig1 = (trace + temp)/2;
      const vx = covXY;
      const vy = eig1 - covXX;
      const ang = Math.atan2(vy, vx) || 0; // major axis angle
      const cos = Math.cos(-ang), sin = Math.sin(-ang);
      const rot = centered.map(v=>[v[0]*cos - v[1]*sin, v[0]*sin + v[1]*cos]);
      // Snap edges to H/V in rotated space
      const snapped: number[][] = [rot[0].slice() as number[]];
      for (let i=0;i<rot.length-1;i++){
        const a = snapped[i];
        const b = rot[i+1];
        const dx = b[0]-a[0], dy = b[1]-a[1];
        if (Math.abs(dx) >= Math.abs(dy)) {
          // horizontal
          snapped.push([b[0], a[1]]);
        } else {
          // vertical
          snapped.push([a[0], b[1]]);
        }
      }
      // For last point (if we didn't include last), ensure length matches input
      while (snapped.length < rot.length) snapped.push(rot[snapped.length]);
      // Rotate back and translate
      const cos2 = Math.cos(ang), sin2 = Math.sin(ang);
      const result = snapped.map(v=>[v[0]*cos2 - v[1]*sin2 + cx, v[0]*sin2 + v[1]*cos2 + cy]);
  const prevEdges = (f.properties?.edges || []) as { i:number; type: EdgeType }[];
  const newEdges = Array.from({length: result.length}, (_,i)=> ({ i, type: (prevEdges.find(e=>e.i===i)?.type || 'unknown') as EdgeType }));
  return { ...f, properties: { ...f.properties, edges: newEdges }, geometry: { type: 'Polygon', coordinates: [result] } };
    }));
  }

  function updatePitch(fi: number, pitch: number) {
    setFeatures((prev) =>
      prev.map((f, idx) => (idx === fi ? { ...f, properties: { ...f.properties, pitch } } : f))
    );
  }

  function setEdgeType(fi: number, ei: number, t: EdgeType) {
    setFeatures((prev) =>
      prev.map((f, idx) => {
        if (idx !== fi) return f;
        const edges: { i: number; type: EdgeType }[] = f.properties.edges || [];
        const found = edges.find((e) => e.i === ei);
        if (found) found.type = t;
        else edges.push({ i: ei, type: t });
        return { ...f, properties: { ...f.properties, edges: [...edges] } };
      })
    );
  }

  // Geometry helpers for labels
  function polygonAreaPx2(ring: number[][]) {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      a += x1 * y2 - x2 * y1;
    }
    return Math.abs(a) / 2;
  }
  function polygonCentroid(ring: number[][]) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      const f = x1 * y2 - x2 * y1;
      a += f;
      cx += (x1 + x2) * f;
      cy += (y1 + y2) * f;
    }
    a = a * 0.5;
    if (Math.abs(a) < 1e-6) {
      // fallback to average
      const sx = ring.reduce((s,p)=>s+p[0],0)/ring.length;
      const sy = ring.reduce((s,p)=>s+p[1],0)/ring.length;
      return { x: sx, y: sy };
    }
    return { x: cx / (6 * a), y: cy / (6 * a) };
  }
  function featurePitch(fi: number) {
    const f = features[fi];
    const p = (typeof f?.properties?.pitch === 'number' ? f.properties.pitch : defaultPitchIn12) || 0;
    return p;
  }
  function featureWeightedPxAreaSum() {
    // sum over features of area_px2 * pitchMultiplier
    let sum = 0;
    features.forEach(f => {
      const ring = f.geometry.coordinates[0];
      const a = polygonAreaPx2(ring);
      const pitch = typeof f.properties?.pitch === 'number' ? f.properties.pitch : defaultPitchIn12;
      const mult = Math.sqrt(1 + Math.pow((pitch || 0)/12, 2));
      sum += a * mult;
    });
    return sum;
  }
  function featureAreaFt2(fi: number) {
    // derive per-feature ft² by distributing totalSquares across weighted pixel areas
    const totalSquares = totals.totalSquares;
    if (!totalSquares || totalSquares <= 0) return null;
    const totalFt2 = totalSquares * 100;
    const denom = featureWeightedPxAreaSum();
    if (!denom || denom <= 0) return null;
    const ring = features[fi].geometry.coordinates[0];
    const px2 = polygonAreaPx2(ring);
    const pitch = featurePitch(fi);
    const mult = Math.sqrt(1 + Math.pow((pitch || 0)/12, 2));
    return (px2 * mult * totalFt2) / denom;
  }

  const save = async () => {
    setMsg('Saving...');
    let snapOk = false;
    // First: snapshot current state so progress is never lost
    try {
      const r = await fetch(`/api/measurements/${measurementId}/versions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: slimFeatures(features), angleDeg }) });
      if (!r.ok) {
        let err = '';
        try { const j = await r.json(); err = j?.error || ''; } catch {}
        setMsg(err ? `Snapshot failed: ${err}` : `Snapshot failed (${r.status})`);
        // Fallback to local snapshot storage
        addLocalSnapshot({ features: slimFeatures(features), angleDeg });
      } else {
        snapOk = true;
        // If Load modal is open, refresh the list so the new snapshot appears immediately
        if (loadOpen) {
          try { const res = await fetch(`/api/measurements/${measurementId}/versions`, { cache: 'no-store' }); const data = await res.json(); setVersions(data?.versions||[]); } catch {}
        }
      }
    } catch {}
    // Then: recompute totals (best effort)
    try {
      const res = await fetch(`/api/measurements/${measurementId}/recompute`, { method: 'POST', body: JSON.stringify({ features }) });
      const data = await res.json();
      try {
        const fc = JSON.parse(data?.geojson || '{}');
        const edgeTotalsFt = fc?.properties?.edgeTotalsFt || null;
        const accessoryTotals = fc?.properties?.accessoryTotals || null;
        const totalSquares = typeof data?.totalSquares === 'number' ? data.totalSquares : null;
        const totalPerimeterFt = typeof data?.totalPerimeterFt === 'number' ? data.totalPerimeterFt : null;
        setTotals({ edgeTotalsFt, accessoryTotals, totalSquares, totalPerimeterFt });
      } catch {}
      setMsg(snapOk ? 'Saved (snapshot + totals)' : 'Saved (totals)');
    } catch (e:any) {
      setMsg(snapOk ? 'Saved snapshot' : 'Error saving');
    }
  }

  const generateReport = async () => {
    try {
  // Always snapshot the drawing progress first
  setMsg('Saving progress...');
      try {
        const rr = await fetch(`/api/measurements/${measurementId}/versions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: slimFeatures(features), angleDeg }) });
        if (!rr.ok) {
          try { const j = await rr.json(); setMsg(j?.error ? `Snapshot failed: ${j.error}` : 'Snapshot failed'); } catch {}
          addLocalSnapshot({ features: slimFeatures(features), angleDeg });
        }
      } catch {}
  // Then recompute totals so report uses SqFt, not px^2
  setMsg('Saving corrections...');
      // We'll pass freshly computed totals to the report API to avoid state staleness
      let computedTotals: { edgeTotalsFt: Record<string, number> | null; accessoryTotals?: Record<string, number> | null; totalSquares: number | null; totalPerimeterFt: number | null } = totals;
      try {
        const res = await fetch(`/api/measurements/${measurementId}/recompute`, { method: 'POST', body: JSON.stringify({ features }) });
        const data = await res.json();
        // Update local totals from recompute response
        try {
          const fc = JSON.parse(data?.geojson || '{}');
          const edgeTotalsFt = fc?.properties?.edgeTotalsFt || null;
          const accessoryTotals = fc?.properties?.accessoryTotals || null;
          const totalSquares = typeof data?.totalSquares === 'number' ? data.totalSquares : null;
          const totalPerimeterFt = typeof data?.totalPerimeterFt === 'number' ? data.totalPerimeterFt : null;
          computedTotals = { edgeTotalsFt, accessoryTotals, totalSquares, totalPerimeterFt };
          setTotals(computedTotals);
        } catch {}
      } catch {}
      setMsg('Generating report...');
      const planeSummaries = features.map((f,idx)=> ({
        index: idx+1,
        pitch: typeof f.properties?.pitch==='number'? f.properties.pitch : defaultPitchIn12,
        vertices: f.geometry.coordinates[0].length,
        layerId: f.properties?.layerId || null
      }));
      // Ask API to save report to Files
      const res = await fetch(`/api/measurements/${measurementId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features, totals: computedTotals, accessoryBreakdown, planeSummaries, imageRotationDeg: angleDeg, saveToFiles: true })
      });
      if (!res.ok) {
        try {
          const err = await res.json();
          setMsg(err?.error ? `Report failed: ${err.error}` : 'Report generation failed');
        } catch {
          setMsg('Report generation failed');
        }
        return;
      }
      const data = await res.json();
  if (data?.ok) {
        setMsg('Report saved to customer files');
        setMsgLink(data.fileId ? `/api/files/${data.fileId}` : null);
        if (data.fileId) {
          try { window.open(`/api/files/${data.fileId}`, '_blank'); } catch {}
        }
      } else {
        setMsg('Report generated');
      }
    } catch (e) {
      setMsg('Report generation failed');
      console.error(e);
    }
  }

  return (
    <div className="space-y-2">
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b">
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          {/* Left: controls (wrap as needed) */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Mode selector */}
            <div className="flex items-center gap-1 text-xs">
              <span>Mode:</span>
              <button className={`px-2 py-0.5 border rounded ${mode==='draw'?'bg-gray-200':''}`} onClick={()=> setMode('draw')}>Draw</button>
              <button className={`px-2 py-0.5 border rounded ${mode==='label'?'bg-gray-200':''}`} onClick={()=> setMode('label')}>Label</button>
              <button className={`px-2 py-0.5 border rounded ${mode==='pitch'?'bg-gray-200':''}`} onClick={()=> setMode('pitch')}>Pitch</button>
            </div>
            {mode==='draw' && (!drawing ? (
              <span className="text-xs text-muted-foreground">Click on the canvas to start drawing.</span>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={finishDraw} className="px-3 py-1 border rounded">Finish</button>
                <button onClick={cancelDraw} className="px-3 py-1 border rounded">Cancel</button>
                <span className="text-xs text-muted-foreground">Click to add points. Click first point or Finish to close.</span>
              </div>
            ))}
            {/* Snap/vertex sliders removed; using fixed sensitivities (4px snap, 6px vertex) */}
            <div className="flex items-center gap-1 text-xs">
              <span>Rotate:</span>
              <button className="px-2 py-0.5 border rounded" onClick={()=>setAngleDeg(a=>a-10)}>-10°</button>
              <button className="px-2 py-0.5 border rounded" onClick={()=>setAngleDeg(a=>a-1)}>-1°</button>
              <span className="px-1">{angleDeg}°</span>
              <button className="px-2 py-0.5 border rounded" onClick={()=>setAngleDeg(a=>a+1)}>+1°</button>
              <button className="px-2 py-0.5 border rounded" onClick={()=>setAngleDeg(a=>a+10)}>+10°</button>
            </div>
            {mode==='pitch' && (
              <div className="flex items-center gap-2 text-xs">
                <span>Pitch:</span>
                <input
                  type="number"
                  className="w-16 border rounded px-1 py-0.5"
                  value={pitchValue}
                  onChange={(e)=> setPitchValue(parseFloat(e.target.value)||0)}
                />
                <span className="text-xs text-muted-foreground">Click a plane to set pitch.</span>
              </div>
            )}
          </div>
          {/* Right: Save + Generate with status under */}
          <div className="flex flex-col items-end gap-1 min-w-[14rem]">
            <div className="flex items-center gap-2">
        <button onClick={async ()=>{
                setLoadOpen(true);
                setVersions(null);
                try {
                  const res = await fetch(`/api/measurements/${measurementId}/versions`, { cache: 'no-store' });
                  const data = await res.json();
                  setVersions(data?.versions||[]);
                  setScopeNote(data?.versions?.length ? '' : '');
                } catch {}
                listLocalSnapshots();
              }} className="px-3 py-1 border rounded">Load</button>
              <button onClick={save} className="px-3 py-1 border rounded">Save</button>
              <button onClick={generateReport} className="px-3 py-1 border rounded bg-emerald-600 text-white">Generate report</button>
            </div>
            {msg && (
              <div className="text-[11px] text-gray-600 leading-none">
                <span>{msg}</span>
                {msgLink && (
                  <a href={msgLink} className="ml-1 underline" target="_blank" rel="noopener noreferrer">Open</a>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Layer menu */}
        <div className="flex flex-wrap items-center gap-1 text-xs px-2 pb-2">
          <span className="font-medium mr-1">Layers:</span>
          {layers.map(l => (
            <button
              key={l.id}
              className={`px-2 py-0.5 border rounded ${activeLayerId===l.id? 'bg-emerald-600 text-white':'bg-white'}`}
              onClick={()=> setActiveLayerId(l.id)}
              title={`Activate layer ${l.name}`}
            >{l.name}</button>
          ))}
          <button
            className="px-2 py-0.5 border rounded bg-white"
            onClick={addLayer}
            title="Add new layer"
          >+</button>
          <button className="ml-2 px-2 py-0.5 border rounded bg-white" onClick={()=> moveLayer(-1)} title="Move layer up (render earlier)">Move up</button>
          <button className="px-2 py-0.5 border rounded bg-white" onClick={()=> moveLayer(1)} title="Move layer down (render later)">Move down</button>
          <span className="ml-2 text-[10px] text-gray-500">Only active layer is editable; others are dimmed and non-interactive.</span>
        </div>
      </div>
      <div className="flex flex-col md:flex-row gap-4">
        {/* Static left sidebar for label/accessory options */}
        {mode==='label' && (
          <div className="w-56 shrink-0 max-h-[70vh] sticky top-16 overflow-auto border rounded p-2 bg-white/95 backdrop-blur-sm shadow" onDragOver={(e)=> e.preventDefault()}>
            <div className="text-xs font-medium mb-2">Label types</div>
            <div className="flex flex-col gap-1">
              {Object.entries(EDGE_COLORS).map(([k,color]) => (
                <button key={k} className={`flex items-center gap-2 px-2 py-1 border rounded text-xs ${activeLabel===k?'ring-2 ring-offset-1 ring-blue-400':''}`} onClick={()=> setActiveLabel(k as EdgeType)}>
                  <span style={{background:color}} className="inline-block w-3 h-3 rounded" />
                  <span className="capitalize">{k}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 border-t pt-2">
              <div className="text-xs font-medium mb-1">Accessories</div>
              <div className="grid grid-cols-2 gap-1 text-[10px] mb-2">
                {['Skylight','Vents','Pipe flange','Other'].map(t => (
                  <div key={t} className="border rounded px-1 py-1 bg-white hover:bg-gray-50 cursor-grab active:cursor-grabbing text-center" draggable onDragStart={(e)=>{accessoryDragTypeRef.current=t; e.dataTransfer.effectAllowed='copy'; e.dataTransfer.setData('text/plain',t);}} onDragEnd={()=>{accessoryDragTypeRef.current=null;}}>{t}</div>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 leading-tight">Drag a type onto a roof plane. A small editor will appear next to it for details.</p>
            </div>
          </div>
        )}
        <div className="relative flex-1 min-w-0">
          {/* Image + SVG editor preserved */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={imageSrc} alt="size-loader" className="hidden" />
        {/* svg with embedded image + overlay */}
        {size.w > 0 && viewBox && (
          <div className="relative w-full" style={{ paddingTop: `${(size.h / size.w) * 100}%` }}>
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              preserveAspectRatio="none"
              ref={svgRef}
              onMouseMove={onMouseMove}
              onMouseUp={(e)=>{ onMouseUp(); onSvgMouseUp(e); }}
              onAuxClick={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
              onDragOver={(e)=>{ if (mode==='label' && accessoryDragTypeRef.current){ e.preventDefault(); }}}
              onDrop={(e)=>{
                if (!(mode==='label' && accessoryDragTypeRef.current)) return;
                e.preventDefault();
                const svg = svgRef.current; if (!svg) return;
                const pt = svg.createSVGPoint();
                pt.x = e.clientX; pt.y = e.clientY;
                const g = groupRef.current; if (!g) return;
                const m = g.getScreenCTM(); if (!m) return;
                const inv = m.inverse();
                const p = pt.matrixTransform(inv);
                let targetFi: number | null = null;
                features.forEach((f, fi)=>{ if (f.properties?.layerId===activeLayerId && pointInPolygon(p.x, p.y, f.geometry.coordinates[0] as any)) targetFi = fi; });
                if (targetFi != null) {
                  addAccessory(targetFi, p.x, p.y, accessoryDragTypeRef.current!);
                }
                accessoryDragTypeRef.current = null;
              }}
              onWheel={(e) => {
              if (!viewBox) return;
              e.preventDefault();
              const svg = svgRef.current!;
              const rect = svg.getBoundingClientRect();
              const px = e.clientX - rect.left;
              const py = e.clientY - rect.top;
              const cw = svg.clientWidth || rect.width || 1;
              const ch = svg.clientHeight || rect.height || 1;
              const wx = viewBox.x + (px / cw) * viewBox.w;
              const wy = viewBox.y + (py / ch) * viewBox.h;
              const delta = e.deltaY;
              const factor = Math.exp(-delta * 0.0015); // smooth zoom
              const minZoom = 0.2; // min scale (relative to full image)
              const maxZoom = 8;   // max scale
              const fullW = size.w;
              const fullH = size.h;
              const curScale = fullW / viewBox.w;
              const newScale = Math.max(minZoom, Math.min(maxZoom, curScale * factor));
              const newW = fullW / newScale;
              const newH = fullH / newScale;
              const newX = wx - (px / cw) * newW;
              const newY = wy - (py / ch) * newH;
              // Clamp to image bounds
              const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
              const clampedX = clamp(newX, 0, Math.max(0, fullW - newW));
              const clampedY = clamp(newY, 0, Math.max(0, fullH - newH));
              setViewBox({ x: clampedX, y: clampedY, w: newW, h: newH });
              }}
              onClick={onSvgClick}
              onMouseDown={onSvgMouseDown}
              onContextMenu={(e)=>{ e.preventDefault(); /* single undo handled on right mouse down */ }}
              style={{
                cursor: mode==='pitch'
                  ? 'none'
                  : mode==='draw'
                    ? 'crosshair'
                    : (drawing ? 'crosshair' : 'default')
              }}
            >
              {/* Snap highlight */}
              {snapHighlight && (
                <circle cx={snapHighlight.x} cy={snapHighlight.y} r={Math.max(2, (viewBox.w/400))} fill="#3b82f6" stroke="#1d4ed8" strokeWidth={viewBox.w/800} />
              )}
              {/* Rotated image layer */}
              <g transform={`rotate(${angleDeg} ${size.w/2} ${size.h/2})`}>
                <image href={imageSrc} x={0} y={0} width={size.w} height={size.h} />
              </g>
              {/* Fixed grid overlay (not rotated) */}
              {(() => {
                const spacing = 25; // denser grid (was 50)
                const lines = [] as JSX.Element[];
                const startX = Math.max(0, Math.floor(viewBox.x / spacing) * spacing);
                const endX = Math.min(size.w, viewBox.x + viewBox.w);
                const startY = Math.max(0, Math.floor(viewBox.y / spacing) * spacing);
                const endY = Math.min(size.h, viewBox.y + viewBox.h);
                for (let x = startX; x <= endX; x += spacing) {
                  lines.push(<line key={`gx-${x}`} x1={x} y1={viewBox.y} x2={x} y2={viewBox.y + viewBox.h} stroke="#d1d5db" strokeWidth={1} strokeOpacity={0.5} />);
                }
                for (let y = startY; y <= endY; y += spacing) {
                  lines.push(<line key={`gy-${y}`} x1={viewBox.x} y1={y} x2={viewBox.x + viewBox.w} y2={y} stroke="#d1d5db" strokeWidth={1} strokeOpacity={0.5} />);
                }
                return <g pointerEvents="none">{lines}</g>;
              })()}
              {/* Rotated features/overlays layer */}
              <g ref={groupRef} transform={`rotate(${angleDeg} ${size.w/2} ${size.h/2})`}>
              {features
                .map((f,fi)=>({ f, fi, layer: layers.find(l=> l.id === (f as any).properties?.layerId) }))
                .sort((a,b)=> (a.layer?.order||0) - (b.layer?.order||0))
                .map(({f,fi,layer}) => {
                  const ring = f.geometry.coordinates[0];
                  const edges = (f.properties.edges || []) as { i:number; type: EdgeType }[];
                  const isActive = f.properties?.layerId === activeLayerId;
                  const dim = !isActive;
                  return (
                <g key={fi} opacity={dim?0.35:1} pointerEvents={dim? 'none':'auto'}>
                  {/* colored edges */}
                   {ring.map((p, i) => {
                     const a = p;
                     const b = ring[(i + 1) % ring.length];
                     const t = (edges.find((e) => e.i === i)?.type || "unknown") as EdgeType;
                     const color = EDGE_COLORS[t];
                     const edgeLen = Math.hypot(b[0]-a[0], b[1]-a[1]);
                     // Dynamic hit width: shorter edges get larger clickable zone, longer edges smaller
                     // 0-40px -> 22px, 100px -> ~12px, 200px+ -> 8px
                     const hitWidth = (()=>{ if (edgeLen <= 40) return 22; if (edgeLen <= 100) return 16; if (edgeLen <= 200) return 12; return 8; })();
                     return (
                       <g key={`e-${i}`}> 
                         {/* Visible styled edge */}
                         <line
                           x1={a[0]}
                           y1={a[1]}
                           x2={b[0]}
                           y2={b[1]}
                           stroke={color}
                           strokeWidth={4}
                           pointerEvents={isActive && mode!=='label' ? 'auto' : 'none'}
                         />
                         {/* Expanded hit zone for labeling (transparent, thicker) */}
                         {isActive && mode==='label' && (
                           <line
                             x1={a[0]}
                             y1={a[1]}
                             x2={b[0]}
                             y2={b[1]}
                             stroke="transparent"
                             strokeWidth={hitWidth}
                             onClick={(ev)=>{ ev.stopPropagation(); setEdgeType(fi, i, activeLabel);} }
                           />
                         )}
                       </g>
                     );
                   })}
                  {/* fill and vertices */}
                   <polygon
                    points={ring.map((p) => p.join(",")).join(" ")}
                    fill={selectedFi===fi?"rgba(0,255,0,0.2)":"rgba(0,255,0,0.1)"}
                    stroke={selectedFi===fi?"#16a34a":"rgba(0,128,0,0.5)"}
                    strokeWidth={1}
                     onClick={(ev)=>{ 
                       // Only intercept clicks on the ACTIVE layer, and only for non-draw modes
                       if (!isActive) return; 
                       if (mode==='label') { 
                         ev.stopPropagation();
                         // Allow labeling by clicking anywhere inside polygon: find nearest edge of THIS polygon
                         const { x, y } = svgToWorld(ev as any);
                         let bestEi = 0; let bestD = Infinity; let bestProjDist = Infinity;
                         for (let iEdge=0;iEdge<ring.length;iEdge++) {
                           const a = ring[iEdge];
                           const b = ring[(iEdge+1)%ring.length];
                           const ax=a[0], ay=a[1], bx=b[0], by=b[1];
                           const abx=bx-ax, aby=by-ay;
                           const ab2 = abx*abx+aby*aby || 1;
                           const t = Math.max(0, Math.min(1, ((x-ax)*abx + (y-ay)*aby)/ab2));
                           const px = ax + t*abx; const py = ay + t*aby;
                           const d = Math.hypot(x-px, y-py);
                           if (d < bestD) { bestD = d; bestEi = iEdge; bestProjDist = d; }
                         }
                         // Allow generous tolerance scaled by viewBox (approx 24px)
                         if (viewBox) {
                           const svg = svgRef.current; if (svg) {
                             const rect = svg.getBoundingClientRect();
                             const pxTol = 24; // pixel tolerance
                             const worldTol = (viewBox.w / (svg.clientWidth || rect.width || 1)) * pxTol;
                             if (bestProjDist <= worldTol) setEdgeType(fi, bestEi, activeLabel);
                           } else {
                             setEdgeType(fi, bestEi, activeLabel);
                           }
                         } else {
                           setEdgeType(fi, bestEi, activeLabel);
                         }
                         return; 
                       }
                        if (mode==='pitch'){ ev.stopPropagation(); updatePitch(fi, pitchValue); return; }
                        // In draw mode, do not select on single click (use double click instead)
                        if (mode==='draw') return;
                        if (mode!=='draw') { ev.stopPropagation(); setSelectedFi(fi); }
                     }}
                     onDoubleClick={(ev)=>{
                       if (!isActive) return;
                       // In draw mode (not actively drawing), double-click selects the polygon
                       if (mode==='draw' && !drawing) { ev.stopPropagation(); setSelectedFi(fi); }
                     }}
                      // Only active layer polygons receive pointer events
                     pointerEvents={isActive ? 'auto' : 'none'}
                     onMouseDown={(ev)=>{
                       if (!isActive) return;
                       if (mode==='draw' && !drawing) {
                         // Start whole-polygon drag only if clicking near centroid
                         const { x, y } = svgToWorld(ev as any);
                         const c = polygonCentroid(ring);
                         let allowed = false;
                         if (viewBox) {
                           const svg = svgRef.current; if (svg) {
                             const rect = svg.getBoundingClientRect();
                             const pxTol = 28;
                             const worldTol = (viewBox.w / (svg.clientWidth || rect.width || 1)) * pxTol;
                             const d = Math.hypot(x - c.x, y - c.y);
                             allowed = d <= worldTol;
                           }
                         }
                         if (allowed) {
                           ev.stopPropagation();
                           setSelectedFi(fi);
                           setPolyDrag({ fi, start: { x, y }, base: ring.map(p=>[p[0], p[1]]) });
                           return;
                         }
                         // else: don't intercept so edge clicks can add vertices
                       }
                     }}
                     style={{ cursor: mode==='draw' && !drawing ? (selectedFi===fi ? 'move' : 'default') : undefined }}
                  />
                  {/* pitch and area labels */}
                  {(() => {
                    const c = polygonCentroid(ring);
                    const p = featurePitch(fi);
                    const area = featureAreaFt2(fi);
                    // find first eave edge, if any
                    const e = (edges.find((e)=> e.type==='eave') || null);
                    let label = p === 0 ? 'flat' : `${p}/12`;
                    const labelX = c.x;
                    const labelY = c.y;
                    return (
                      <g pointerEvents="none" transform={`rotate(${-angleDeg} ${labelX} ${labelY})`}>
                        <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="central" fontSize={14} fontFamily="monospace" fill="#111827" stroke="#fff" strokeWidth={1} paintOrder="stroke">
                          {label}{area!=null ? `  •  ${area.toFixed(0)} SqFt.` : ''}
                        </text>
                        {/* eave arrow removed per request */}
                      </g>
                    );
                  })()}
                  {ring.map((p, pi) => (
                    <g key={pi}>
                      {/* visible tiny dot */}
                      <circle cx={p[0]} cy={p[1]} r={2} fill="#ff5252" stroke="none" pointerEvents="none" />
                      {/* invisible hit area for easier dragging */}
                      <circle
                        cx={p[0]}
                        cy={p[1]}
                        r={9}
                        fill="transparent"
                        stroke="none"
                        onMouseDown={(ev)=>{ ev.stopPropagation(); if (isActive && mode!=='label' && mode!=='pitch') onMouseDown(fi, pi)(ev); }}
                        style={{ cursor: "grab" }}
                      />
                    </g>
                  ))}
                  {/* Accessories */}
                  {Array.isArray(f.properties.accessories) && f.properties.accessories.map(acc => {
                    const labelParts: string[] = [];
                    if (acc.type === 'Skylight') { if (acc.data?.size) labelParts.push(acc.data.size); }
                    else if (acc.type === 'Vents') { if (acc.data?.options) labelParts.push(acc.data.options.join(',')); }
                    else if (acc.type === 'Pipe flange') { if (acc.data?.size) labelParts.push(acc.data.size); }
                    else if (acc.type === 'Other') { if (acc.data?.note) labelParts.push(acc.data.note); }
                    else { labelParts.push(acc.type); }
                    const isEditing = editingAccessory && editingAccessory.fi===fi && editingAccessory.accId===acc.id;
                    return (
                      <g key={acc.id}>
                        {/* Keep green square unrotated relative to grid by counter-rotating */}
                        <g transform={`rotate(${-angleDeg} ${acc.x} ${acc.y})`}>
                          <rect x={acc.x-3} y={acc.y-3} width={6} height={6} fill="#10b981" stroke="#065f46" strokeWidth={1}
                            style={{ cursor: mode==='label' ? 'move' : 'default' }}
                            onMouseDown={(ev)=>{ if (mode==='label'){ ev.stopPropagation(); setDragAccessory({ fi, accId: acc.id }); }} }
                            onDoubleClick={(ev)=>{ ev.stopPropagation(); setEditingAccessory({ fi, accId: acc.id }); setAccessoryDraft(JSON.parse(JSON.stringify(acc.data||{}))); }}
                          />
                        </g>
                        {labelParts.length>0 && (
                          <g transform={`rotate(${-angleDeg} ${acc.x} ${acc.y})`} pointerEvents="none">
                            <text x={acc.x} y={acc.y+12} fontSize={10} textAnchor="middle" fill="#111827" stroke="#fff" strokeWidth={0.5} paintOrder="stroke" fontFamily="monospace">{labelParts.join(' ')}</text>
                          </g>
                        )}
                        {/* editing popover moved to global overlay */}
                      </g>
                    );
                  })}
                </g>
                  );
                })}
        {/* pitch mode cursor overlay (always visible in pitch mode) */}
        {mode==='pitch' && hoverPt && (
                <g pointerEvents="none">
          <circle cx={hoverPt.x} cy={hoverPt.y} r={3} fill="#111827" />
          <text x={hoverPt.x + 8} y={hoverPt.y - 8} fill="#111827" fontSize={12} fontFamily="monospace" stroke="#fff" strokeWidth={0.8} paintOrder="stroke">{pitchValue}/12</text>
                </g>
              )}
              {/* in-progress drawing with crosshair overlay */}
              {drawing && (
                <g>
                  {drawing.points.length > 0 && (
                    <polyline
                      points={drawing.points.map((p) => p.join(",")).join(" ") + (hoverPt ? ` ${hoverPt.x},${hoverPt.y}` : "")}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth={2}
                    />
                  )}
                  {drawing.points.map((p, i) => (
                    <circle key={`dp-${i}`} cx={p[0]} cy={p[1]} r={2} fill="#10b981" />
                  ))}
                  {/* Removed large blue hover circle for clearer precise placement */}
                </g>
              )}
              </g>
              {/* Fixed crosshair overlay aligned with the grid (outside rotation) */}
              {drawing && hoverPt && viewBox && (
                (() => {
                  const p = worldToOuter(hoverPt);
                  return (
                    <g pointerEvents="none">
                      <line x1={viewBox.x} y1={p.y} x2={viewBox.x + viewBox.w} y2={p.y} stroke="#0ea5e9" strokeWidth={1} strokeDasharray="4 4" />
                      <line x1={p.x} y1={viewBox.y} x2={p.x} y2={viewBox.y + viewBox.h} stroke="#0ea5e9" strokeWidth={1} strokeDasharray="4 4" />
                    </g>
                  );
                })()
              )}
              {/* Global accessory editing popover overlay (top layer) */}
              {editingAccessory && (() => {
                const { fi, accId } = editingAccessory;
                const feat = features[fi];
                if (!feat) return null;
                const acc = (feat.properties?.accessories||[]).find((a:any)=> a.id===accId);
                if (!acc) return null;
                const type = acc.type;
                // Compute on-screen rotated position (since features are drawn inside a rotated group)
                const cx = size.w/2, cy = size.h/2;
                const rad = angleDeg * Math.PI/180;
                const dx = acc.x - cx, dy = acc.y - cy;
                const rx = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
                const ry = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
                return (
                  <g pointerEvents="auto">
                    <foreignObject x={rx+8} y={ry-4} width={180} height={170} style={{ overflow: 'visible', pointerEvents: 'all' as any }}>
                      <div
                        className="bg-white shadow-2xl rounded border p-2 space-y-2 text-[11px] w-44"
                        onMouseDown={(e)=> { e.stopPropagation(); }}
                        onMouseUp={(e)=> { e.stopPropagation(); }}
                        onClick={(e)=> { e.stopPropagation(); }}
                        onWheel={(e)=> { e.stopPropagation(); e.preventDefault(); }}
                        onPointerDown={(e)=> { e.stopPropagation(); }}
                        onPointerUp={(e)=> { e.stopPropagation(); }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{type}</span>
                          <button className="text-gray-400 hover:text-gray-600" onClick={()=>{ setEditingAccessory(null); setAccessoryDraft(null); }}>×</button>
                        </div>
                        {type==='Skylight' && (
                          <div className="space-y-1">
                            <label className="block">
                              <span className="text-[10px] uppercase tracking-wide">Size</span>
                              <input className="mt-0.5 w-full border rounded px-1 py-0.5" value={accessoryDraft?.size||''} onChange={e=> setAccessoryDraft((d:any)=> ({...d, size: e.target.value}))} placeholder="M08" />
                            </label>
                          </div>
                        )}
                        {type==='Vents' && (
                          <div className="space-y-1">
                            {['636','634','B-Vent'].map(opt => (
                              <label key={opt} className="flex items-center gap-1">
                                <input type="checkbox" checked={!!accessoryDraft?.options?.includes(opt)} onChange={(e)=> setAccessoryDraft((d:any)=> { const opts = new Set(d?.options||[]); if(e.target.checked) opts.add(opt); else opts.delete(opt); return {...d, options: Array.from(opts)}; })} />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        )}
                        {type==='Pipe flange' && (
                          <div className="space-y-1">
                            {['1"-2"','3"-4"'].map(opt => (
                              <label key={opt} className="flex items-center gap-1">
                                <input type="radio" name={`pf-${acc.id}`} checked={accessoryDraft?.size===opt} onChange={()=> setAccessoryDraft((d:any)=> ({...d, size: opt}))} />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        )}
                        {type==='Other' && (
                          <div className="space-y-1">
                            <label className="block">
                              <span className="text-[10px] uppercase tracking-wide">Label</span>
                              <input className="mt-0.5 w-full border rounded px-1 py-0.5" value={accessoryDraft?.note||''} onChange={e=> setAccessoryDraft((d:any)=> ({...d, note: e.target.value}))} placeholder="Custom" />
                            </label>
                          </div>
                        )}
                        <div className="flex flex-wrap justify-between gap-1 pt-1">
                          <button className="flex-1 min-w-[45px] px-2 py-0.5 text-[10px] border rounded" onClick={()=>{ removeAccessory(fi, accId); setEditingAccessory(null); setAccessoryDraft(null); }}>Delete</button>
                          <button className="flex-1 min-w-[55px] px-2 py-0.5 text-[10px] border rounded" onClick={()=>{ setEditingAccessory(null); setAccessoryDraft(null); }}>Cancel</button>
                          <button className="flex-1 min-w-[45px] px-2 py-0.5 text-[10px] bg-emerald-600 text-white rounded" onClick={()=>{ updateAccessoryData(fi, accId, accessoryDraft); setEditingAccessory(null); setAccessoryDraft(null); }}>Save</button>
                        </div>
                      </div>
                    </foreignObject>
                  </g>
                );
              })()}
            </svg>
          </div>
        )}
        </div>
      </div>
  {/* Totals section moved below canvas */}
      <div className="mt-4">
        <div className="p-2 border rounded bg-white/80">
          <div className="text-sm font-semibold mb-1">Totals</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex items-center gap-2"><span>Squares:</span><span className="font-medium tabular-nums">{totals.totalSquares!=null? totals.totalSquares.toFixed(2):'—'}</span></div>
            <div className="flex items-center gap-2"><span>Perimeter (ft):</span><span className="font-medium tabular-nums">{totals.totalPerimeterFt!=null? totals.totalPerimeterFt.toFixed(1):'—'}</span></div>
          </div>
          {totals.edgeTotalsFt && (
            <div className="mt-3">
              <div className="text-xs font-semibold mb-1">Edges</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1 text-[11px]">
                {Object.entries(totals.edgeTotalsFt).map(([k,v]) => (
                  <div key={k} className="flex items-center gap-1 px-2 py-1 border rounded bg-white/60">
                    <span className="w-3 h-3 inline-block rounded" style={{background:EDGE_COLORS[k as EdgeType] || '#9ca3af'}} />
                    <span className="capitalize">{k}</span>
                    <span className="font-mono ml-auto">{(v as number).toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Object.keys(accessoryBreakdown).length>0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold mb-1">Accessories</div>
              <div className="space-y-3">
                {Object.entries(accessoryBreakdown).map(([type, entries]) => (
                  <div key={type} className="border rounded p-2 bg-white/60">
                    <div className="text-[11px] font-semibold mb-1 capitalize">{type}</div>
                    <ul className="text-[11px] space-y-0.5">
                      {Object.entries(entries).sort((a,b)=> a[0].localeCompare(b[0])).map(([val,count],i) => (
                        <li key={val} className="flex items-center gap-2">
                          <span className="font-mono text-[10px] w-4 text-right">{count}</span>
                          <span className="flex-1 truncate" title={val}>{val}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Load modal */}
      {loadOpen && (
        <div className="fixed inset-0 z-30 bg-black/20 flex items-center justify-center" onClick={()=> setLoadOpen(false)}>
          <div className="bg-white rounded shadow-xl border w-[420px] max-w-[96vw]" onClick={(e)=> e.stopPropagation()}>
            <div className="p-3 border-b flex items-center justify-between">
              <div className="font-semibold text-sm">Saved versions</div>
              <button className="text-gray-500 hover:text-gray-700" onClick={()=> setLoadOpen(false)}>×</button>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              {!versions && (
                <div className="p-3 text-sm text-gray-500">Loading…</div>
              )}
              {versions && versions.length===0 && (
                <div className="p-3 text-sm text-gray-500">No saved versions yet.</div>
              )}
              {versions && versions.length>0 && (
                <ul className="divide-y">
                  {versions.map(v => (
                    <li key={v.id} className="p-3 flex items-center justify-between">
                      <div className="text-sm">
                        <div className="font-medium">{v.name || 'Snapshot'}</div>
                        <div className="text-xs text-gray-500">{new Date(v.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="px-2 py-1 border rounded text-xs" onClick={async ()=>{
                          try {
                            const res = await fetch(`/api/measurements/${measurementId}/versions/${v.id}`);
                            const data = await res.json();
                            const payload = data?.payload || {};
                            const sourceMeasurementId = data?.measurementId || measurementId;
                            if (Array.isArray(payload.features)) {
                              setFeatures(payload.features);
                              setAngleDeg(typeof payload.angleDeg==='number' ? payload.angleDeg : angleDeg);
                              // recompute on the source measurement (in case snapshot came from another measurement under same contact)
                              try {
                                const res2 = await fetch(`/api/measurements/${sourceMeasurementId}/recompute`, { method: 'POST', body: JSON.stringify({ features: payload.features }) });
                                const d2 = await res2.json();
                                const fc = JSON.parse(d2?.geojson || '{}');
                                const edgeTotalsFt = fc?.properties?.edgeTotalsFt || null;
                                const accessoryTotals = fc?.properties?.accessoryTotals || null;
                                const totalSquares = typeof d2?.totalSquares === 'number' ? d2.totalSquares : null;
                                const totalPerimeterFt = typeof d2?.totalPerimeterFt === 'number' ? d2.totalPerimeterFt : null;
                                setTotals({ edgeTotalsFt, accessoryTotals, totalSquares, totalPerimeterFt });
                              } catch {}
                              setLoadOpen(false);
                            }
                          } catch {}
                        }}>Load</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {localVersions && localVersions.length>0 && (
                <>
                  <div className="px-3 pt-3 text-xs text-gray-500">Local snapshots (this browser)</div>
                  <ul className="divide-y">
                    {localVersions.map(v => (
                      <li key={v.id} className="p-3 flex items-center justify-between">
                        <div className="text-sm">
                          <div className="font-medium">Local snapshot</div>
                          <div className="text-xs text-gray-500">{new Date(v.createdAt).toLocaleString()}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="px-2 py-1 border rounded text-xs" onClick={()=> loadLocalSnapshot(v.id)}>Load</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div className="p-3 border-t text-right">
              <button className="px-3 py-1 border rounded" onClick={()=> setLoadOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
