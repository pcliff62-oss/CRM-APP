"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';

interface PlannerProps {
  contactId: string;
  leadId?: string;
  propertyId?: string;
  normalizedAddress: string;
  onClose?: () => void;
}

interface Waypoint { lat: number; lng: number; altitudeFt?: number; action?: string; }

// Simple utility to compute a lawn-mower pattern over a bounding box
function generateLawnMower(bounds: any, spacingMeters: number): Waypoint[] {
  if (!bounds) return [];
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const latStep = (spacingMeters / 111320);
  const latStart = sw.lat();
  const latEnd = ne.lat();
  const waypoints: Waypoint[] = [];
  let dir = 1;
  for (let lat = latStart; lat <= latEnd; lat += latStep) {
    waypoints.push({ lat, lng: dir === 1 ? sw.lng() : ne.lng() });
    dir *= -1;
  }
  waypoints.push({ lat: latEnd, lng: dir === 1 ? sw.lng() : ne.lng() });
  return waypoints;
}

export default function DroneScanPlanner({ contactId, leadId, propertyId, normalizedAddress, onClose }: PlannerProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<any>(null);
  const [targetPolygon, setTargetPolygon] = useState<any>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [status, setStatus] = useState<string>('Select area or draw polygon');
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('Roof Scan');
  const [altitudeFt, setAltitudeFt] = useState(150);
  const [frontOverlap, setFrontOverlap] = useState(75);
  const [sideOverlap, setSideOverlap] = useState(65);
  const [captureMode, setCaptureMode] = useState<'NADIR' | 'OBLIQUE' | 'FULL'>('NADIR');
  const [pitchDeg, setPitchDeg] = useState<number | ''>('');
  const [autoProcessing, setAutoProcessing] = useState(true);
  const [photoEstimate, setPhotoEstimate] = useState<number | null>(null);
  const userMarkerRef = useRef<any>(null);

  // Initialize map
  useEffect(() => {
    if (mapRef.current && !map && typeof window !== 'undefined' && (window as any).google?.maps) {
      const m = new (window as any).google.maps.Map(mapRef.current, {
        mapTypeId: 'satellite',
        tilt: 0,
        zoom: 19,
        disableDefaultUI: true,
      });
      setMap(m);
      // Geocode initial address if provided
      if (normalizedAddress) {
        const geocoder = new (window as any).google.maps.Geocoder();
        geocoder.geocode({ address: normalizedAddress }, (results: any, status: any) => {
          if (status === 'OK' && results && results[0]) {
            m.fitBounds(results[0].geometry.viewport || new (window as any).google.maps.LatLngBounds(results[0].geometry.location, results[0].geometry.location));
          }
        });
      }
    }
  }, [map, normalizedAddress]);

  // Simple drawing interaction (click to add points, double-click to finish)
  useEffect(() => {
  if (!map || !(window as any).google?.maps) return;
  const path: any[] = [];
  let polyline: any = null;
  const listener = map.addListener('click', (e: any) => {
      if (!e.latLng) return;
      path.push(e.latLng.toJSON());
      if (!polyline) {
    polyline = new (window as any).google.maps.Polyline({ map, path, strokeColor: '#ff00ff', strokeWeight: 2 });
      } else {
        polyline.setPath(path);
      }
    });
    const dbl = map.addListener('dblclick', () => {
      if (path.length >= 3) {
        polyline?.setMap(null);
    const polygon = new (window as any).google.maps.Polygon({ map, paths: path, strokeColor: '#ff00ff', fillColor: '#ff00ff', fillOpacity: 0.15 });
        setTargetPolygon(polygon);
        setStatus('Polygon selected');
      }
    });
    return () => { listener.remove(); dbl.remove(); };
  }, [map]);

  const computeBounds = useCallback(() => {
    if (!targetPolygon) return null;
  const g = (window as any).google?.maps;
  if (!g) return null;
  const bounds = new g.LatLngBounds();
  targetPolygon.getPath().forEach((p: any) => bounds.extend(p));
    return bounds;
  }, [targetPolygon]);

  const planMission = () => {
    const bounds = computeBounds();
    if (!bounds) { setStatus('Draw polygon first'); return; }
    const altitudeM = altitudeFt * 0.3048;
    const footprintM = altitudeM * (13.2 / 8.8); // ~1.5 * altitude
    const effectiveWidth = footprintM * (1 - frontOverlap / 100);
    const spacingMeters = Math.max(2, effectiveWidth);
    const pts = generateLawnMower(bounds, spacingMeters);
    setWaypoints(pts);
    setStatus(`Planned ${pts.length} waypoints`);
    const modeMultiplier = captureMode === 'NADIR' ? 1 : (captureMode === 'OBLIQUE' ? 1.8 : 2.4);
    setPhotoEstimate(Math.round(pts.length * modeMultiplier));
  };

  const saveMission = async () => {
    try {
      setLoading(true);
      // Build GeoJSON features
      let polyFeature: any = null;
      if (targetPolygon) {
        const coords: any[] = [];
        targetPolygon.getPath().forEach((p: any) => coords.push([p.lng(), p.lat()]));
        if (coords.length && (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1])) coords.push(coords[0]);
        polyFeature = { type: 'Feature', properties: { kind: 'area' }, geometry: { type: 'Polygon', coordinates: [coords] } };
      }
      const lineFeature = waypoints.length ? { type: 'Feature', properties: { kind: 'path' }, geometry: { type: 'LineString', coordinates: waypoints.map(w => [w.lng, w.lat]) } } : null;
      const pathGeoJson = JSON.stringify({ type: 'FeatureCollection', features: [polyFeature, lineFeature].filter(Boolean) });
      const res = await fetch('/api/drone-missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          leadId,
          propertyId,
          contactId,
          altitudeFt,
          frontOverlap,
          sideOverlap,
          captureMode,
          pitchDeg: pitchDeg === '' ? null : pitchDeg,
          pathGeoJson,
          waypoints,
          photoCountEst: photoEstimate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setStatus('Mission saved');
      if (autoProcessing) {
        await fetch('/api/processing-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ missionId: data.mission.id, type: 'PHOTOGRAMMETRY' }) });
      }
    } catch (e: any) {
      setStatus(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Geolocation watch
  useEffect(() => {
    if (!map || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(pos => {
      const { latitude, longitude } = pos.coords;
      const g = (window as any).google?.maps; if (!g) return;
      if (!userMarkerRef.current) {
        userMarkerRef.current = new g.Marker({ map, position: { lat: latitude, lng: longitude }, icon: { path: g.SymbolPath.CIRCLE, fillColor: '#2563eb', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2, scale: 5 } });
      } else {
        userMarkerRef.current.setPosition({ lat: latitude, lng: longitude });
      }
    });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [map]);

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-12 gap-4 p-4 border-b bg-slate-50">
        <div className="col-span-3 flex flex-col gap-2 overflow-y-auto max-h-[80vh] pr-1">
          <label className="text-xs font-medium">Title
            <input value={title} onChange={e=>setTitle(e.target.value)} className="mt-1 w-full h-8 rounded border px-2 text-sm" />
          </label>
          <label className="text-xs font-medium">Altitude (ft)
            <input type="number" value={altitudeFt} onChange={e=>setAltitudeFt(Number(e.target.value))} className="mt-1 w-full h-8 rounded border px-2 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium">Front Overlap %
              <input type="number" value={frontOverlap} onChange={e=>setFrontOverlap(Number(e.target.value))} className="mt-1 w-full h-8 rounded border px-2 text-sm" />
            </label>
            <label className="text-xs font-medium">Side Overlap %
              <input type="number" value={sideOverlap} onChange={e=>setSideOverlap(Number(e.target.value))} className="mt-1 w-full h-8 rounded border px-2 text-sm" />
            </label>
          </div>
          <label className="text-xs font-medium">Capture Mode
            <select value={captureMode} onChange={e=>setCaptureMode(e.target.value as any)} className="mt-1 w-full h-8 rounded border px-2 text-sm">
              <option value="NADIR">Nadir</option>
              <option value="OBLIQUE">Oblique</option>
              <option value="FULL">Full</option>
            </select>
          </label>
          <label className="text-xs font-medium">Roof Pitch (deg)
            <input type="number" value={pitchDeg} onChange={e=>setPitchDeg(e.target.value === '' ? '' : Number(e.target.value))} className="mt-1 w-full h-8 rounded border px-2 text-sm" placeholder="optional" />
          </label>
          <button onClick={planMission} className="h-9 px-3 rounded bg-purple-600 text-white text-sm">Generate Path</button>
          <button onClick={saveMission} disabled={loading} className="h-9 px-3 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">{loading ? 'Saving...' : 'Save Mission'}</button>
          <label className="inline-flex items-center gap-2 text-xs mt-1">
            <input type="checkbox" checked={autoProcessing} onChange={e=>setAutoProcessing(e.target.checked)} /> Auto processing job
          </label>
          <div className="text-xs text-slate-600">Status: {status}</div>
          <div className="text-xs text-slate-600">Waypoints: {waypoints.length}</div>
          <div className="text-xs text-slate-600">Photos est: {photoEstimate ?? '—'}</div>
          <div className="text-[10px] text-slate-500 mt-2 leading-snug">NOTE: This is a planning placeholder. Actual DJI flight execution requires a mobile bridge/app (e.g. using DJI Mobile SDK) not implemented here.</div>
          <button onClick={onClose} className="mt-4 text-xs text-slate-500 hover:text-black underline">Close</button>
        </div>
        <div className="col-span-9 relative">
          <div ref={mapRef} className="absolute inset-0" />
          <WaypointLayer map={map} waypoints={waypoints} />
        </div>
      </div>
    </div>
  );
}

// Waypoint overlay layer
function WaypointLayer({ map, waypoints }: { map: any; waypoints: Waypoint[] }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!map) return;
    let raf: number;
    const loop = () => { force(x => x + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [map]);
  if (!map) return null;
  const proj = (map as any).getProjection?.();
  const g = (window as any).google?.maps;
  if (!proj || !g) return null;
  const scale = Math.pow(2, map.getZoom());
  return (
    <div className="absolute inset-0 pointer-events-none">
      {waypoints.map((w,i)=>{
        const latLng = new g.LatLng(w.lat, w.lng);
        const pt = proj.fromLatLngToPoint ? proj.fromLatLngToPoint(latLng) : null;
        if (!pt) return null;
        const x = pt.x * scale; const y = pt.y * scale;
        return <div key={i} className="absolute bg-purple-600 text-white text-[10px] h-4 min-w-4 px-1 rounded flex items-center justify-center border border-white" style={{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%)` }}>{i+1}</div>;
      })}
    </div>
  );
}
