"use client";
// Consolidated PropertyMap implementation moved here to avoid importing from route segment (which can cause chunk resolution issues in Next.js dev when dynamically imported elsewhere).
import { useEffect, useRef, useState, useCallback } from 'react';
import html2canvas from 'html2canvas';

// Minimal ambient typings (avoid namespace to keep lint quiet if rule unavailable)
// These sit on globalThis as loose interfaces.
interface GoogleLatLngLiteral { lat: number; lng: number }
interface GoogleMVCArray<T> { getArray(): T[] }
interface GooglePolygon { getPath(): GoogleMVCArray<{ lat(): number; lng(): number }>; setMap(map: any): void }

type MeasurementPolygon = { id: string; path: { lat: number; lng: number }[] };

type Props = {
	address: string;
	lat?: number | null;
	lng?: number | null;
	propertyId?: string | undefined;
	// When true, enables drawing/editing polygons for measurement
	measurementMode?: boolean;
	// Callback when polygons change (added/edited/removed). Provides plain lat/lng arrays.
	onPolygonsChange?: (polys: MeasurementPolygon[]) => void;
	// Optional override for height / sizing classes
	className?: string;
	// Fired when center resolved (geocode or initial lat/lng)
	onCenterResolved?: (pos: { lat: number; lng: number }) => void;
};

declare global { interface Window { google?: any; } }

export default function PropertyMapGoogle({ address, lat, lng, propertyId, measurementMode = false, onPolygonsChange, className, onCenterResolved }: Props) {
	const ref = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<any>(null);
	const markerRef = useRef<any>(null);
	const streetViewRef = useRef<any>(null);
	const [ready, setReady] = useState(false);
	const [initialCenter] = useState<{lat:number;lng:number}|null>(lat && lng ? {lat,lng} : null);
	const [centerPos, setCenterPos] = useState<{lat:number;lng:number}|null>(lat && lng ? {lat,lng} : null);
	const [isStreetView, setIsStreetView] = useState(false);
	const [panoAvailable, setPanoAvailable] = useState<boolean | null>(null);
	const drawingManagerRef = useRef<any>(null);
	const polygonsRef = useRef<any[]>([]);
	const [heading, setHeading] = useState(0); // visual rotation (CSS) for 2D map
	// Track container size so we can forward-rotate overlay pixel coordinates
	const [mapSize, setMapSize] = useState<{w:number;h:number}>({ w:0, h:0 });
	// Pixel offset between visual container center and actual map projection center (calibrated)
	const centerOffsetRef = useRef<{x:number;y:number}>({ x:0, y:0 });
	// Separate 3D preview state (independent map instance)
	const [show3DPreview, setShow3DPreview] = useState(false);
	const previewMapRef = useRef<any>(null);
	const previewContainerRef = useRef<HTMLDivElement | null>(null);
	const mapContainerRef = useRef<HTMLDivElement | null>(null);
	// Local drawing mode mirror ('pan' | 'polygon') for custom toolbar
	const [drawingMode, setDrawingMode] = useState<'pan'|'polygon'>('pan');
	// Magnifier lens
	const magnifierRef = useRef<HTMLDivElement | null>(null);
	const magnifierMapRef = useRef<any>(null);
	const [showMagnifier, setShowMagnifier] = useState(false); // internal active state during mouse hold
	// When true we are holding mouse to place a point (vertex) and can move before committing
	const holdPlacingRef = useRef(false);
	// Candidate lat/lng under crosshair while holding
	const candidateLatLngRef = useRef<any>(null);
	// Custom drawing path (manual polygon building instead of DrawingManager live rubber band)
	// Use plain literal (avoid google namespace typing to keep ambient minimal)
	const [activePath, setActivePath] = useState<GoogleLatLngLiteral[]>([]);
	const activePolylineRef = useRef<any>(null);
	const [magnifierZoomDelta] = useState(2); // fixed zoom delta now
	const [lensPos, setLensPos] = useState<{x:number;y:number}>({x:0,y:0});
	const lensAnimatingRef = useRef(false);
	// Active path pixel positions for rendering vertex markers
	const [activePixelPoints, setActivePixelPoints] = useState<{x:number;y:number}[]>([]);
	const recomputePixelPoints = useCallback(()=>{
		if (!overlayRef.current?.getProjection || !mapRef.current) return;
		try {
			const proj = overlayRef.current.getProjection();
			if (!proj) return;
			const pts = activePath.map(p=>{
				const latLng = new window.google.maps.LatLng(p.lat, p.lng);
				const pt = proj.fromLatLngToContainerPixel(latLng);
				return { x: pt.x, y: pt.y };
			});
			setActivePixelPoints(pts);
		} catch {}
	}, [activePath]);

	useEffect(()=>{ recomputePixelPoints(); }, [recomputePixelPoints, heading]);

	// Calibrate center pixel offset whenever map idles or size changes
	useEffect(()=>{
		if (!overlayRef.current || !overlayRef.current.getProjection || !mapRef.current) return;
		try {
			const proj = overlayRef.current.getProjection();
			if (!proj) return;
			const mapCenter = mapRef.current.getCenter?.();
			if (!mapCenter) return;
			const px = proj.fromLatLngToContainerPixel(mapCenter);
			if (px && mapSize.w && mapSize.h) {
				centerOffsetRef.current = { x: px.x - mapSize.w/2, y: px.y - mapSize.h/2 };
			}
		} catch {}
	}, [mapSize, heading, activePath]);
	useEffect(()=>{
		if (!mapRef.current || !window.google?.maps) return;
		const idleH = window.google.maps.event.addListener(mapRef.current,'idle',()=>{
			if (!overlayRef.current?.getProjection) return;
			try {
				const proj = overlayRef.current.getProjection();
				const c = mapRef.current.getCenter();
				if (!c) return;
				const px = proj.fromLatLngToContainerPixel(c);
				const el = mapContainerRef.current; if (!el) return;
				const r = el.getBoundingClientRect();
				centerOffsetRef.current = { x: px.x - r.width/2, y: px.y - r.height/2 };
			} catch {}
		});
		return ()=>{ try { window.google.maps.event.removeListener(idleH); } catch {}; };
	}, []);
	useEffect(()=>{
		if (!mapRef.current) return;
		const h1 = window.google?.maps?.event?.addListener(mapRef.current, 'idle', recomputePixelPoints);
		const h2 = window.google?.maps?.event?.addListener(mapRef.current, 'zoom_changed', recomputePixelPoints);
		return ()=>{ try { h1 && window.google.maps.event.removeListener(h1); } catch {}; try { h2 && window.google.maps.event.removeListener(h2); } catch {}; };
	}, [recomputePixelPoints]);

	// Cursor position (unrotated pixel) & close detection
	// Raw cursor screen-space (within map container) before inverse rotation
	const [cursorPos, setCursorPos] = useState<{x:number;y:number}|null>(null);
	const [closeReady, setCloseReady] = useState(false);
	const moveRafRef = useRef(false);
	const [hoverVertex, setHoverVertex] = useState<number|null>(null);
	// Crosshair customization & rotation lock
	const [crosshairColor, setCrosshairColor] = useState<string>('rgba(255,255,255,0.45)');
	const [crosshairThin, setCrosshairThin] = useState<boolean>(false);
	const [lockRotation, setLockRotation] = useState<boolean>(false);
	const [showEdgeLengths, setShowEdgeLengths] = useState<boolean>(true);

	// Live metrics (area/perimeter) for activePath
	const activeMetrics = (()=>{
		if (!window.google?.maps || !window.google.maps.geometry || activePath.length < 2) return null;
		try {
			const pathLatLng = activePath.map(p=> new window.google.maps.LatLng(p.lat, p.lng));
			const area = pathLatLng.length >=3 ? window.google.maps.geometry.spherical.computeArea(pathLatLng) : 0;
			let perim = 0;
			for (let i=0;i<pathLatLng.length-1;i++) perim += window.google.maps.geometry.spherical.computeDistanceBetween(pathLatLng[i], pathLatLng[i+1]);
			return { area, perim };
		} catch { return null; }
	})();

	// Segment distances (for overlay labels) recomputed when path or pixels change
	const segmentLabels = (()=>{
		if (!window.google?.maps || !window.google.maps.geometry || !showEdgeLengths) return [] as {x:number;y:number;text:string}[];
		if (activePath.length < 2 || activePixelPoints.length !== activePath.length) return [];
		try {
			const out: {x:number;y:number;text:string}[] = [];
			for (let i=0;i<activePath.length-1;i++) {
				const aLL = new window.google.maps.LatLng(activePath[i].lat, activePath[i].lng);
				const bLL = new window.google.maps.LatLng(activePath[i+1].lat, activePath[i+1].lng);
				const d = window.google.maps.geometry.spherical.computeDistanceBetween(aLL,bLL);
				const aPx = activePixelPoints[i];
				const bPx = activePixelPoints[i+1];
				if (aPx && bPx) {
					out.push({ x:(aPx.x+bPx.x)/2, y:(aPx.y+bPx.y)/2, text: d.toFixed(2)+'m' });
				}
			}
			return out;
		} catch { return []; }
	})();
	// Overlay projection helper (created once) so we can map screen pixels -> LatLng with native heading applied
	const overlayRef = useRef<any>(null);
	const overlayReadyRef = useRef(false);
	const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

	// Helper: inverse-rotate screen point (x,y) around center back into unrotated map coordinates
	const unrotatePoint = useCallback((x:number, y:number, width:number, height:number, angleDeg:number) => {
		const cx = width/2; const cy = height/2;
		const rad = angleDeg * Math.PI / 180;
		const cos = Math.cos(-rad); const sin = Math.sin(-rad);
		const dx = x - cx; const dy = y - cy;
		return { x: dx * cos - dy * sin + cx, y: dx * sin + dy * cos + cy };
	}, []);

	// Forward rotate (opposite of unrotatePoint) used to position markers/labels in screen space matching rotated tiles
	const rotatePoint = useCallback((x:number, y:number, width:number, height:number, angleDeg:number) => {
		const cx = width/2; const cy = height/2;
		const rad = angleDeg * Math.PI / 180;
		const cos = Math.cos(rad); const sin = Math.sin(rad);
		const dx = x - cx; const dy = y - cy;
		return { x: dx * cos - dy * sin + cx, y: dx * sin + dy * cos + cy };
	}, []);

	// Observe container size for rotation math
	useEffect(()=>{
		const el = mapContainerRef.current; if (!el) return;
		const measure = () => { const r = el.getBoundingClientRect(); setMapSize({ w: r.width, h: r.height }); };
		measure();
		window.addEventListener('resize', measure);
		return ()=> window.removeEventListener('resize', measure);
	}, []);

	const tryDetectStreetView = (pos:{lat:number;lng:number}) => {
		if (!window.google?.maps) return;
		const svs = new window.google.maps.StreetViewService();
		svs.getPanorama({ location: pos, radius: 50 }, (data:any, status:string) => {
			if (status === 'OK') setPanoAvailable(true); else setPanoAvailable(false);
		});
	};

	const toggleStreetView = () => {
		if (!mapRef.current || !centerPos) return;
		if (!isStreetView) {
			if (panoAvailable === false) return; // nothing to show
			if (!streetViewRef.current) {
				streetViewRef.current = mapRef.current.getStreetView();
				streetViewRef.current.setPosition(centerPos);
				streetViewRef.current.setPov({ heading: 0, pitch: 0 });
			} else {
				streetViewRef.current.setPosition(centerPos);
			}
			streetViewRef.current.setVisible(true);
			setIsStreetView(true);
		} else {
			streetViewRef.current?.setVisible(false);
			setIsStreetView(false);
		}
	};

	// Load script once (include drawing+geometry if measurementMode)
	useEffect(() => {
		if (window.google?.maps && (!measurementMode || window.google.maps.drawing)) { setReady(true); return; }
		if (!apiKey) { console.warn('Missing Google Maps API key.'); return; }
		const existing = document.querySelector('script[data-google-maps]');
		if (existing) { existing.addEventListener('load', () => setReady(true)); return; }
		const libs = ['places'];
		if (measurementMode) libs.push('drawing','geometry');
		const s = document.createElement('script');
		s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=${libs.join(',')}`;
		s.async = true; s.defer = true; s.dataset.googleMaps = '1'; s.onload = () => setReady(true);
		document.head.appendChild(s);
	}, [apiKey, measurementMode]);

	useEffect(() => { if (initialCenter) tryDetectStreetView(initialCenter); }, [initialCenter, ready]);

	// Magnifier setup / resize: ensure tiles render (blank issue mitigation)
	useEffect(()=>{
		if (!showMagnifier) return;
		if (!window.google?.maps || !mapRef.current) return;
		if (!magnifierRef.current) return;
		if (!magnifierMapRef.current) {
			magnifierMapRef.current = new window.google.maps.Map(magnifierRef.current, {
				mapTypeId:'satellite', disableDefaultUI:true, draggable:false, scrollwheel:false, clickableIcons:false, gestureHandling:'none',
				tilt:0,
				zoom: Math.min((mapRef.current.getZoom?.()||19)+magnifierZoomDelta, 23),
				center: mapRef.current.getCenter?.() || centerPos
			});
		} else {
			// sync zoom immediately
			const targetZoom = Math.min((mapRef.current.getZoom?.()||19)+magnifierZoomDelta, 23);
			if (magnifierMapRef.current.getZoom() !== targetZoom) magnifierMapRef.current.setZoom(targetZoom);
			magnifierMapRef.current.setCenter(mapRef.current.getCenter?.());
		}
		// Force a resize so tiles paint if container recently shown
		try { window.google.maps.event.trigger(magnifierMapRef.current, 'resize'); } catch {}
		// slight delayed resize as safety
		setTimeout(()=>{ try { window.google.maps.event.trigger(magnifierMapRef.current, 'resize'); } catch {}; }, 60);
	}, [showMagnifier, magnifierZoomDelta, centerPos]);

	// Magnifier mouse move follow + center sync; also update candidate point (native heading)
	useEffect(()=>{
		if (!showMagnifier) return;
		const host = mapContainerRef.current;
		if (!host) return;
		const handleMove = (ev:MouseEvent) => {
			const rect = host.getBoundingClientRect();
			const rawX = ev.clientX - rect.left;
			const rawY = ev.clientY - rect.top;
			setLensPos({ x: rawX, y: rawY });
			if (!lensAnimatingRef.current) {
				lensAnimatingRef.current = true;
				requestAnimationFrame(()=>{
					lensAnimatingRef.current = false;
					if (!magnifierMapRef.current || !mapRef.current || !window.google?.maps) return;
					try {
						const baseMap = mapRef.current;
						const proj = baseMap.getProjection?.();
						if (proj) {
							// Convert pointer from rotated space to unrotated map pixel space
							const unrot = unrotatePoint(rawX, rawY, rect.width, rect.height, heading);
							const scale = Math.pow(2, baseMap.getZoom?.()||19);
							const worldCoordCenter = proj.fromLatLngToPoint(baseMap.getCenter());
							const worldCoordCursor = new window.google.maps.Point(
								worldCoordCenter.x + (unrot.x - rect.width/2)/256/scale,
								worldCoordCenter.y + (unrot.y - rect.height/2)/256/scale
							);
							const latLng = proj.fromPointToLatLng(worldCoordCursor);
							if (latLng) {
								candidateLatLngRef.current = latLng;
								magnifierMapRef.current.setCenter(latLng);
							}
						}
						const targetZoom = Math.min((baseMap.getZoom?.()||19)+magnifierZoomDelta, 23);
						if (magnifierMapRef.current.getZoom() !== targetZoom) magnifierMapRef.current.setZoom(targetZoom);
					} catch{}
				});
			}
		};
		window.addEventListener('mousemove', handleMove);
		return ()=>{ window.removeEventListener('mousemove', handleMove); };
	}, [showMagnifier, magnifierZoomDelta, heading, unrotatePoint]);

	// Active polygon drawing mode (custom implementation)
	const isPolygonDrawingMode = () => drawingMode === 'polygon';

	const applyDrawingMode = (mode:'pan'|'polygon') => {
		setDrawingMode(mode);
		if (mode === 'polygon') {
			// Ensure polyline exists for live preview
			if (window.google?.maps && mapRef.current && !activePolylineRef.current) {
				try {
					activePolylineRef.current = new window.google.maps.Polyline({
						map: mapRef.current,
						path: [],
						strokeColor: '#2563eb',
						strokeOpacity: 1,
						strokeWeight: 2,
						zIndex: 10
					});
				} catch {}
			}
		} else {
			// Leaving draw mode: clear transient candidate segment
			if (activePolylineRef.current) {
				try { activePolylineRef.current.setPath(activePath); } catch {}
			}
		}
	};

	// Finish current custom polygon (convert to google Polygon) and reset active path
	const finishActivePolygon = () => {
		if (!window.google?.maps || !mapRef.current) return;
		if (activePath.length < 3) return;
		try {
			const poly = new window.google.maps.Polygon({
				map: mapRef.current,
				paths: activePath,
				fillColor: '#2563eb', fillOpacity: 0.35,
				strokeColor: '#1d4ed8', strokeWeight: 2,
				editable: true
			});
			polygonsRef.current.push(poly);
			wirePolygonListeners(poly);
			emitPolygons();
			setActivePath([]);
			if (activePolylineRef.current) { activePolylineRef.current.setPath([]); }
			applyDrawingMode('pan');
		} catch {}
	};


	// Track last cache signature to avoid duplicate POSTs
	const lastCacheSigRef = useRef<string | null>(null);
	useEffect(() => {
		if (!ready || !ref.current) return;
		if (!window.google?.maps) return;
		if (!mapRef.current) {
			mapRef.current = new window.google.maps.Map(ref.current, {
				mapTypeId: 'satellite', zoom: 19, tilt: 0, disableDefaultUI: true, zoomControl: true, disableDoubleClickZoom: true,
			});
			// (Removed DrawingManager polygon creation; custom drawing implemented instead)
		}
		// If we had initial lat/lng just once
		if (initialCenter && !centerPos) {
			mapRef.current.setCenter(initialCenter);
			if (!measurementMode) {
				markerRef.current = new window.google.maps.Marker({ position: initialCenter, map: mapRef.current });
			}
			setCenterPos(initialCenter);
			onCenterResolved?.(initialCenter);
			const sig = propertyId ? `${propertyId}:${initialCenter.lat.toFixed(6)},${initialCenter.lng.toFixed(6)}` : '';
			if (propertyId && lastCacheSigRef.current !== sig) {
				lastCacheSigRef.current = sig;
				fetch('/api/geocode-cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: propertyId, lat: initialCenter.lat, lng: initialCenter.lng }) }).catch(()=>{});
			}
			return;
		}
		if (!address) return;
		const geocoder = new window.google.maps.Geocoder();
		geocoder.geocode({ address }, (results: any, status: string) => {
			if (status !== 'OK' || !results?.length) { console.warn('Geocode failed', status); return; }
			const loc = results[0].geometry.location;
			const pos = { lat: loc.lat(), lng: loc.lng() };
			mapRef.current.setCenter(pos); mapRef.current.setZoom(20);
			if (!measurementMode) {
				if (markerRef.current) markerRef.current.setMap(null);
				markerRef.current = new window.google.maps.Marker({ position: pos, map: mapRef.current });
			}
			setCenterPos(pos); tryDetectStreetView(pos); onCenterResolved?.(pos);
			const sig = propertyId ? `${propertyId}:${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}` : '';
			if (propertyId && lastCacheSigRef.current !== sig) {
				lastCacheSigRef.current = sig;
				fetch('/api/geocode-cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: propertyId, lat: pos.lat, lng: pos.lng }) }).catch(()=>{});
			}
		});
	// Depend only on ready + address + propertyId + initialCenter + measurementMode
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ready, address, initialCenter, propertyId, measurementMode]);

	// Emit polygons as plain coordinates to parent
	const emitPolygons = () => {
		if (!onPolygonsChange) return;
		try {
			const out: MeasurementPolygon[] = polygonsRef.current.map((poly, idx) => {
				const pts = poly.getPath().getArray().map((p: any) => ({ lat: p.lat(), lng: p.lng() }));
				return { id: (poly as any)._measureId || `poly-${idx}`, path: pts };
			});
			onPolygonsChange(out);
		} catch {}
	};

	// Wire listeners for edits to a polygon
	const wirePolygonListeners = (poly: any) => {
		['insert_at','remove_at','set_at'].forEach(evt => {
			window.google.maps.event.addListener(poly.getPath(), evt, () => emitPolygons());
		});
		if (window.google?.maps?.event) {
			window.google.maps.event.addListener(poly as any, 'rightclick', (e: any) => {
				if (e?.vertex != null) return; // ignore vertex context menu
				polygonsRef.current = polygonsRef.current.filter(p => p !== poly);
				poly.setMap(null);
				emitPolygons();
			});
		}
	};

	const adjustHeading = (delta:number) => {
		if (lockRotation) return; // rotation locked during drawing if enabled
		const newHeading = (heading + delta + 360) % 360;
		setHeading(newHeading);
	};

	// Open / close 3D preview overlay
	const open3DPreview = () => setShow3DPreview(true);
	const close3DPreview = () => setShow3DPreview(false);

	// Initialize preview map when overlay opens
	useEffect(()=>{
		if (!show3DPreview) return;
		if (!window.google?.maps) return;
		if (!previewContainerRef.current) return;
		if (previewMapRef.current) return; // already created
		if (!mapRef.current) return;
		try {
			previewMapRef.current = new window.google.maps.Map(previewContainerRef.current, {
				mapTypeId: 'satellite',
				zoom: mapRef.current.getZoom?.() || 19,
				center: mapRef.current.getCenter?.(),
				tilt: 45,
				heading
			});
		} catch {}
	}, [show3DPreview, heading]);

	// Sync preview map heading if user rotates while preview open
	useEffect(()=>{
		if (show3DPreview && previewMapRef.current?.setHeading) {
			try { previewMapRef.current.setHeading(heading); } catch {}
		}
	}, [heading, show3DPreview]);

	// Create an invisible OverlayView once for projection mapping
	useEffect(()=>{
		if (!window.google?.maps || !mapRef.current || overlayRef.current) return;
		if (!('OverlayView' in window.google.maps)) return;
		const OV = new window.google.maps.OverlayView();
		OV.onAdd = () => {};
		OV.draw = () => { if (!overlayReadyRef.current) overlayReadyRef.current = true; };
		OV.onRemove = () => {};
		OV.setMap(mapRef.current);
		overlayRef.current = OV;
	}, [ready]);

	// Snapshot (in-app) state
	const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
	const [snapshotScale, setSnapshotScale] = useState<number | null>(null); // meters per pixel
	const [isSnapshotMode, setIsSnapshotMode] = useState(false);
	const [snapshotWidth, setSnapshotWidth] = useState<number | null>(null);
	const [snapshotHeight, setSnapshotHeight] = useState<number | null>(null);
	const [snapshotZoom, setSnapshotZoom] = useState(1); // client-side zoom multiplier
	const [snapshotHeading, setSnapshotHeading] = useState(0); // captured heading (informational only)
	const [panX, setPanX] = useState(0);
	const [panY, setPanY] = useState(0);
	const isPanningRef = useRef(false);
	const lastPanPosRef = useRef<{x:number;y:number}|null>(null);
	const [showSnapshotPanel, setShowSnapshotPanel] = useState(true);
	// Snapshot drawing state
	const snapshotDrawRef = useRef<SVGSVGElement | null>(null);
	const [activePoints, setActivePoints] = useState<{x:number;y:number;}[]>([]);
	const [closedPolygons, setClosedPolygons] = useState<{points:{x:number;y:number;}[]; areaPx:number;}[]>([]);

	const finishSnapshotPolygon = () => {
		if (activePoints.length < 3) return;
		let area = 0; // shoelace in px^2
		for (let i=0;i<activePoints.length;i++) {
			const a = activePoints[i];
			const b = activePoints[(i+1)%activePoints.length];
			area += a.x * b.y - b.x * a.y;
		}
		area = Math.abs(area)/2;
		setClosedPolygons(polys => [...polys, { points: activePoints, areaPx: area }]);
		setActivePoints([]);
	};

	const computePerimeterPx = (pts:{x:number;y:number;}[]) => {
		let p = 0;
		for (let i=0;i<pts.length;i++) {
			const a = pts[i];
			const b = pts[(i+1)%pts.length];
			p += Math.hypot(b.x - a.x, b.y - a.y);
		}
		return p;
	};

	const clearCurrentSnapshot = () => setActivePoints([]);
	const clearAllSnapshot = () => { setActivePoints([]); setClosedPolygons([]); };

	const handleSnapshotClick = (e: React.MouseEvent) => {
		if (!isSnapshotMode) return;
		const hostRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const screenX = e.clientX - hostRect.left;
		const screenY = e.clientY - hostRect.top;
		const origX = (screenX - panX) / snapshotZoom;
		const origY = (screenY - panY) / snapshotZoom;
		setActivePoints(prev => [...prev, { x: origX, y: origY }]);
	};

	// Wheel zoom handler (anchor at image center)
	const onWheelSnapshot = (e: React.WheelEvent) => {
		if (!isSnapshotMode) return;
		e.preventDefault();
		const delta = e.deltaY;
		const factor = delta < 0 ? 1.1 : 0.9;
		setSnapshotZoom(oldZoom => {
			const newZoomUnclamped = oldZoom * factor;
			const newZoom = Math.min(20, Math.max(0.2, newZoomUnclamped));
			if (newZoom !== oldZoom && snapshotWidth && snapshotHeight) {
				const centerScreenX = panX + (snapshotWidth/2)*oldZoom;
				const centerScreenY = panY + (snapshotHeight/2)*oldZoom;
				const newPanX = centerScreenX - (snapshotWidth/2)*newZoom;
				const newPanY = centerScreenY - (snapshotHeight/2)*newZoom;
				setPanX(newPanX);
				setPanY(newPanY);
			}
			return newZoom;
		});
	};

	const onPointerDownSnapshot = (e: React.PointerEvent) => {
		if (!isSnapshotMode) return;
		// Middle button only (button === 1)
		if (e.button === 1) {
			isPanningRef.current = true;
			lastPanPosRef.current = { x: e.clientX, y: e.clientY };
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
			e.preventDefault();
		}
	};

	const onPointerMoveSnapshot = (e: React.PointerEvent) => {
		if (!isSnapshotMode) return;
		if (isPanningRef.current && lastPanPosRef.current) {
			const dx = e.clientX - lastPanPosRef.current.x;
			const dy = e.clientY - lastPanPosRef.current.y;
			setPanX(p => p + dx);
			setPanY(p => p + dy);
			lastPanPosRef.current = { x: e.clientX, y: e.clientY };
		}
	};

	const endPan = (e: React.PointerEvent) => {
		if (isPanningRef.current) {
			isPanningRef.current = false;
			lastPanPosRef.current = null;
			try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
		}
	};

	const captureScreenshot = async () => {
		if (!mapContainerRef.current || !mapRef.current) return;
		try {
			// Compute scale: sample two LatLng a known pixel distance apart using projection
			const map = mapRef.current;
			const projection = (map as any).getProjection?.();
			let metersPerPixel: number | null = null;
			if (projection && centerPos) {
				// pick horizontal 100px span around center to reduce distortion
				const spanPx = 100;
				const cPoint = projection.fromLatLngToPoint(centerPos);
				if (cPoint) {
					const g = (window as any).google;
					if (g?.maps?.Point) {
						const left = new g.maps.Point(cPoint.x - spanPx / (256 * Math.pow(2, map.getZoom() || 0)), cPoint.y);
						const right = new g.maps.Point(cPoint.x + spanPx / (256 * Math.pow(2, map.getZoom() || 0)), cPoint.y);
						const leftLatLng = projection.fromPointToLatLng(left);
						const rightLatLng = projection.fromPointToLatLng(right);
						if (leftLatLng && rightLatLng) {
							const R = 6371000;
							const toRad = (d:number)=>d*Math.PI/180;
							const dLat = toRad(rightLatLng.lat() - leftLatLng.lat());
							const dLon = toRad(rightLatLng.lng() - leftLatLng.lng());
							const a = Math.sin(dLat/2)**2 + Math.cos(toRad(leftLatLng.lat())) * Math.cos(toRad(rightLatLng.lat())) * Math.sin(dLon/2)**2;
							const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
							const meters = R * c;
							metersPerPixel = meters / spanPx;
						}
					}
				}
			}
			const canvas = await html2canvas(mapContainerRef.current, { useCORS: true, logging: false, backgroundColor: '#000' });
			setSnapshotUrl(canvas.toDataURL('image/png'));
			setSnapshotScale(metersPerPixel);
			setSnapshotWidth(canvas.width);
			setSnapshotHeight(canvas.height);
			setSnapshotZoom(1);
			// Preserve the heading at capture time (map already rotated). No further rotation applied in snapshot.
			setSnapshotHeading(heading);
			setIsSnapshotMode(true);
		} catch (e) { console.warn('Screenshot failed', e); }
	};



	// We now render overlays INSIDE the rotated map container so no forward-rotation of pixel points is needed.

	return (
		<div className={`${className || (measurementMode ? 'relative w-full h-[60vh] rounded-md overflow-hidden' : 'relative w-full h-64 rounded-md overflow-hidden')} ${measurementMode && isPolygonDrawingMode() ? 'measure-draw-mode' : ''}`}>
			{/* Suppress native cursors in Google map tiles while drawing */}
			{measurementMode && isPolygonDrawingMode() && (
				<style>{`
					.measure-draw-mode .gm-style, .measure-draw-mode .gm-style * { cursor: none !important; }
				`}</style>
			)}
			{/* Live Map Layer (hidden when snapshot mode) */}
			<div ref={mapContainerRef} 
				className={`${isSnapshotMode ? 'hidden' : 'block'} absolute inset-0 overflow-hidden`} 
				style={{ transform: `rotate(${heading}deg)`, transformOrigin:'50% 50%', cursor: (measurementMode && isPolygonDrawingMode()) ? 'none' : 'grab' }}
				tabIndex={0}
				onKeyDown={(e)=>{
					if (!isPolygonDrawingMode()) return;
					if (e.key === 'Enter') { finishActivePolygon(); }
					if (e.key === 'Escape') { setActivePath([]); try { activePolylineRef.current?.setPath([]); } catch {} }
					if (e.key === 'Backspace' || e.key === 'Delete' || (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey || !e.shiftKey))) {
						e.preventDefault();
						if (activePath.length) {
							const next = activePath.slice(0, -1);
							setActivePath(next);
							try { activePolylineRef.current?.setPath(next); } catch {}
							recomputePixelPoints();
						}
					}
				}}
				onDoubleClick={(e)=>{ if (isPolygonDrawingMode() && activePath.length>=3) { e.preventDefault(); finishActivePolygon(); } }}
				onMouseMove={(e)=>{
					if (!measurementMode || isSnapshotMode || !isPolygonDrawingMode()) return;
					const host = mapContainerRef.current; if (!host) return;
					const rect = host.getBoundingClientRect();
					const rawX = e.clientX - rect.left; const rawY = e.clientY - rect.top;
					setCursorPos({ x: rawX, y: rawY });
					// Adjust for calibrated center offset BEFORE inverse rotation
					const adjXc = rawX - centerOffsetRef.current.x;
					const adjYc = rawY - centerOffsetRef.current.y;
					const unrot = unrotatePoint(adjXc, adjYc, rect.width, rect.height, heading);
					if (!moveRafRef.current) {
						moveRafRef.current = true;
						requestAnimationFrame(()=>{
							moveRafRef.current = false;
							if (!window.google?.maps || !mapRef.current) return;
							// Prefer overlay projection (container pixels -> LatLng) for accuracy under rotation
							let latLng: any = null;
							try {
								const overlayProj = overlayRef.current?.getProjection?.();
								if (overlayProj) {
									latLng = overlayProj.fromContainerPixelToLatLng(new window.google.maps.Point(unrot.x, unrot.y));
								} else {
									const projFallback = mapRef.current.getProjection?.();
									if (projFallback) {
										const scale = Math.pow(2, mapRef.current.getZoom?.()||19);
										const worldCoordCenter = projFallback.fromLatLngToPoint(mapRef.current.getCenter());
										const worldCoordCursor = new window.google.maps.Point(
											worldCoordCenter.x + (unrot.x - rect.width/2)/256/scale,
											worldCoordCenter.y + (unrot.y - rect.height/2)/256/scale
										);
										latLng = projFallback.fromPointToLatLng(worldCoordCursor);
									}
								}
							} catch {}
							if (latLng) {
								candidateLatLngRef.current = latLng;
								if (activePolylineRef.current) {
									const preview = activePath.length ? [...activePath, { lat: latLng.lat(), lng: latLng.lng() }] : [];
									activePolylineRef.current.setPath(preview);
								}
							}
							// Close readiness (distance to first point)
							if (activePixelPoints.length>0) {
								const fp = activePixelPoints[0];
									const dx = unrot.x - fp.x; const dy = unrot.y - fp.y;
								setCloseReady(activePath.length>=3 && Math.hypot(dx,dy) < 10);
							}
						});
					}
				}}
				onMouseDown={(e)=>{ 
					if (e.button===0 && measurementMode && isPolygonDrawingMode()) { 
						// Start hold-to-place mode
						e.preventDefault(); e.stopPropagation();
						holdPlacingRef.current = true;
						setShowMagnifier(true);
						candidateLatLngRef.current = null; // reset candidate each hold
						// Disable map dragging while placing
						try { mapRef.current?.setOptions?.({ draggable:false, gestureHandling:'none' }); } catch {}
						// Initialize lens at current pointer position immediately so it doesn't flash at (0,0)
						const host = mapContainerRef.current; if (host) {
							const rect = host.getBoundingClientRect();
							setLensPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
						}
					}
				}} 
				onMouseUp={(e)=>{ 
					if (e.button===0 && holdPlacingRef.current) {
						if (window.google?.maps && mapRef.current && isPolygonDrawingMode()) {
							// Recompute precise candidate using final mouse position (account for CSS rotation)
							const host = mapContainerRef.current;
							if (host) {
								const rect = host.getBoundingClientRect();
								const rawX = e.clientX - rect.left;
								const rawY = e.clientY - rect.top;
								const unrot = unrotatePoint(rawX, rawY, rect.width, rect.height, heading);
								try {
									const baseMap = mapRef.current;
									let latLng = null;
									const overlayProj = overlayRef.current?.getProjection?.();
									if (overlayProj) {
										latLng = overlayProj.fromContainerPixelToLatLng(new window.google.maps.Point(unrot.x, unrot.y));
									} else {
										const proj = baseMap.getProjection?.();
										if (proj) {
											const scale = Math.pow(2, baseMap.getZoom?.()||19);
											const worldCoordCenter = proj.fromLatLngToPoint(baseMap.getCenter());
											const worldCoordCursor = new window.google.maps.Point(
												worldCoordCenter.x + (unrot.x - rect.width/2)/256/scale,
												worldCoordCenter.y + (unrot.y - rect.height/2)/256/scale
											);
											latLng = proj.fromPointToLatLng(worldCoordCursor);
										}
									}
									if (latLng) candidateLatLngRef.current = latLng;
								} catch {}
							}
							if (candidateLatLngRef.current) {
								// Append to activePath instead of triggering map click (custom drawing)
								if (closeReady) {
									finishActivePolygon();
								} else {
									setActivePath(prev => {
										const next = [...prev, { lat: candidateLatLngRef.current.lat(), lng: candidateLatLngRef.current.lng() }];
										try { activePolylineRef.current?.setPath(next); } catch {}
										recomputePixelPoints();
										return next;
									});
								}
							}
						}
						holdPlacingRef.current = false;
						setShowMagnifier(false);
						// Re-enable map dragging
						try { mapRef.current?.setOptions?.({ draggable:true, gestureHandling:'greedy' }); } catch {}
					}
				}} 
				onMouseLeave={()=>{ 
					if (holdPlacingRef.current) { holdPlacingRef.current = false; }
					setShowMagnifier(false); 
						try { mapRef.current?.setOptions?.({ draggable:true, gestureHandling:'greedy' }); } catch {}
				}}
			>
				<div ref={ref} className="absolute inset-0" />
			</div>
			{/* Custom toolbar (unrotated) */}
			{measurementMode && !isSnapshotMode && (
				<div className="absolute top-2 left-2 z-20 flex gap-2 bg-white/90 backdrop-blur rounded shadow border px-2 py-1 text-[11px] select-none">
					<button type="button" onClick={()=>applyDrawingMode('pan')} className={`px-2 py-1 rounded border ${drawingMode==='pan'?'bg-blue-600 text-white border-blue-600':'bg-white hover:bg-gray-50'}`}>Pan</button>
					<button type="button" onClick={()=>applyDrawingMode('polygon')} className={`px-2 py-1 rounded border ${drawingMode==='polygon'?'bg-blue-600 text-white border-blue-600':'bg-white hover:bg-gray-50'}`}>Draw</button>
					<button type="button" onClick={open3DPreview} className="px-2 py-1 rounded border bg-white hover:bg-gray-50">3D Preview</button>
					<button type="button" onClick={()=>setLockRotation(v=>!v)} className={`px-2 py-1 rounded border ${lockRotation?'bg-amber-500 text-white border-amber-500':'bg-white hover:bg-gray-50'}`}>{lockRotation?'Rot Locked':'Lock Rot'}</button>
					<button type="button" onClick={()=>setShowEdgeLengths(v=>!v)} className={`px-2 py-1 rounded border ${showEdgeLengths?'bg-indigo-500 text-white border-indigo-500':'bg-white hover:bg-gray-50'}`}>{showEdgeLengths?'Hide Len':'Show Len'}</button>
					{drawingMode==='polygon' && activePath.length>0 && (
						<button type="button" onClick={()=>{ if(activePath.length){ const next=activePath.slice(0,-1); setActivePath(next); try{activePolylineRef.current?.setPath(next);}catch{} recomputePixelPoints(); } }} className="px-2 py-1 rounded border bg-white hover:bg-gray-50">Undo</button>
					)}
					{drawingMode==='polygon' && activePath.length>=3 && (
						<button type="button" onClick={()=>finishActivePolygon()} className="px-2 py-1 rounded border bg-green-600 text-white hover:bg-green-500">Finish</button>
					)}
				</div>
			)}
			{/* Snapshot Layer */}
			{isSnapshotMode && snapshotUrl && (
				<div className="absolute inset-0 bg-black select-none" onWheel={onWheelSnapshot} onPointerDown={onPointerDownSnapshot} onPointerMove={onPointerMoveSnapshot} onPointerUp={endPan} onPointerLeave={endPan}>
						{/* Use explicit matrix to avoid ambiguity in transform order (matrix = pan + zoom * rotation about top-left) */}
						{(() => {
							const a = snapshotZoom;
							const d = snapshotZoom;
							const e = panX;
							const f = panY;
							const matrix = `matrix(${a}, 0, 0, ${d}, ${e}, ${f})`;
							return (
								<div style={{ position:'absolute', top:0, left:0, transform: matrix, transformOrigin:'top left', width: snapshotWidth || '100%', height: snapshotHeight || '100%' }}>
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img src={snapshotUrl} alt="Snapshot" style={{ width: snapshotWidth || '100%', height: snapshotHeight || '100%', display:'block', pointerEvents:'none' }} draggable={false} />
									<svg ref={snapshotDrawRef} onClick={handleSnapshotClick} width={snapshotWidth || undefined} height={snapshotHeight || undefined} style={{ position:'absolute', inset:0, width: snapshotWidth || '100%', height: snapshotHeight || '100%', cursor:'crosshair' }}>
										{closedPolygons.map((poly,i)=>{
											const dPath = poly.points.map((p,idx)=>`${idx===0?'M':'L'}${p.x},${p.y}`).join(' ') + ' Z';
											return <path key={i} d={dPath} fill="rgba(250,204,21,0.30)" stroke="#ca8a04" strokeWidth={2} />;
										})}
										{activePoints.length>0 && (
											<polyline points={activePoints.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#3b82f6" strokeWidth={2} />
										)}
										{activePoints.map((p,i)=>(<circle key={i} cx={p.x} cy={p.y} r={4} fill="#3b82f6" stroke="#ffffff" strokeWidth={1} />))}
									</svg>
								</div>
							);
						})()}
					{/* Screen-aligned faint gridlines (every 50px), outside transformed layer */}
					<div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 50px), repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 50px)' }} />
				</div>
			)}
			<div className="absolute top-2 right-2 flex flex-col gap-2 z-10">
				{!measurementMode && !isSnapshotMode && (
					<button type="button" onClick={toggleStreetView} disabled={!centerPos || panoAvailable === false} className="px-3 py-1 text-xs rounded bg-white shadow border hover:bg-gray-50 transition disabled:opacity-40" title={panoAvailable === false ? 'No Street View available here' : 'Toggle Street View'}>
						{isStreetView ? 'Map View' : 'Street View'}
					</button>
				)}
				{measurementMode && !isSnapshotMode && (
					<div className="flex flex-col gap-2">
						<div className="flex gap-1 bg-white/80 backdrop-blur px-2 py-1 rounded shadow border">
							<button type="button" onClick={()=>adjustHeading(-10)} className="px-2 py-0.5 text-[10px] rounded bg-white border hover:bg-gray-50">-10°</button>
							<button type="button" onClick={()=>adjustHeading(-1)} className="px-2 py-0.5 text-[10px] rounded bg-white border hover:bg-gray-50">-1°</button>
							<button type="button" onClick={()=>adjustHeading(0-heading)} className="px-2 py-0.5 text-[10px] rounded bg-white border hover:bg-gray-50">Reset</button>
							<button type="button" onClick={()=>adjustHeading(1)} className="px-2 py-0.5 text-[10px] rounded bg-white border hover:bg-gray-50">+1°</button>
							<button type="button" onClick={()=>adjustHeading(10)} className="px-2 py-0.5 text-[10px] rounded bg-white border hover:bg-gray-50">+10°</button>
						</div>
						<div className="flex gap-1">
							<button type="button" onClick={captureScreenshot} className="px-3 py-1 text-xs rounded bg-white shadow border hover:bg-gray-50 transition" title="Freeze current map view for snapshot measuring">Snapshot</button>
							<button type="button" onClick={() => {
								polygonsRef.current.forEach(p => p.setMap(null));
								polygonsRef.current = [];
								emitPolygons();
							}} className="px-3 py-1 text-xs rounded bg-white shadow border hover:bg-gray-50 transition" title="Clear all drawn polygons">Clear All</button>
						</div>
						<div className="text-[10px] text-white bg-black/40 px-2 py-0.5 rounded self-end">Heading {heading.toFixed(0)}°</div>
					</div>
				)}
				{isSnapshotMode && showSnapshotPanel && (
					<div className="flex flex-col gap-2 bg-white/90 backdrop-blur px-2 py-2 rounded shadow border text-xs max-w-[300px]">
						<button type="button" onClick={()=>setShowSnapshotPanel(false)} className="absolute -top-2 -right-2 bg-white border rounded-full w-6 h-6 text-[11px] shadow hover:bg-gray-50">×</button>
						<div className="font-semibold flex justify-between items-center"><span>Snapshot Mode</span><span className="text-[9px] font-normal">{snapshotScale ? `${snapshotScale.toFixed(2)} m/px` : 'scale ?'}</span></div>
						<div className="text-[10px] leading-snug">Image already rotated (heading {snapshotHeading.toFixed(0)}°). To change orientation, exit and take a new snapshot. Use zoom + pan to position.</div>
						<div className="flex flex-wrap gap-1 items-center">
							<div className="flex gap-1 bg-white/70 border rounded px-1 py-0.5">
								<button type="button" onClick={()=>setSnapshotZoom(z=> Math.max(0.25, +(z/1.25).toFixed(2)))} className="px-2 py-0.5 text-[10px] rounded border bg-white hover:bg-gray-50">-</button>
								<div className="px-1 text-[10px] flex items-center font-mono">{snapshotZoom.toFixed(2)}x</div>
								<button type="button" onClick={()=>setSnapshotZoom(z=> Math.min(12, +(z*1.25).toFixed(2)))} className="px-2 py-0.5 text-[10px] rounded border bg-white hover:bg-gray-50">+</button>
							</div>
							<button type="button" onClick={()=>{ setPanX(0); setPanY(0); }} className="px-2 py-0.5 text-[10px] rounded border bg-white hover:bg-gray-50">Center</button>
						</div>
						{(closedPolygons.length>0 || activePoints.length>2) && (
							<div className="space-y-1 max-h-40 overflow-auto pr-1 border rounded p-1 bg-white/60">
								{activePoints.length>2 && (()=>{
									const areaPx = (()=>{let a=0; for(let i=0;i<activePoints.length;i++){const A=activePoints[i],B=activePoints[(i+1)%activePoints.length]; a+=A.x*B.y-B.x*A.y;} return Math.abs(a)/2;})();
									const perPx = computePerimeterPx(activePoints);
									const areaM2 = snapshotScale ? areaPx * (snapshotScale ** 2) : null;
									const perM = snapshotScale ? perPx * snapshotScale : null;
									return <div className="flex flex-col gap-0.5 text-[10px] border-b pb-1 mb-1" key="active"><div className="flex justify-between"><span>Active</span><span className="font-mono">{areaM2 ? (areaM2/9.290304).toFixed(2) : '—'} sq</span></div><div className="flex justify-between text-[9px]"><span>Perim</span><span className="font-mono">{perM ? perM.toFixed(2) : '—'} m</span></div></div>;
								})()}
								{closedPolygons.map((poly,i)=>{
									const areaM2 = snapshotScale ? poly.areaPx * (snapshotScale ** 2) : null;
									return <div key={i} className="flex justify-between gap-2 text-[10px]"><span>Poly {i+1}</span><span className="font-mono">{areaM2 ? (areaM2/9.290304).toFixed(2) : '—'} sq</span></div>;
								})}
								{closedPolygons.length>1 && (()=>{
									const totalM2 = snapshotScale ? closedPolygons.reduce((s,p)=> s + p.areaPx * (snapshotScale **2),0): null;
									return <div className="flex justify-between gap-2 text-[10px] font-semibold border-t pt-1 mt-1" key="total"><span>Total</span><span className="font-mono">{totalM2 ? (totalM2/9.290304).toFixed(2) : '—'} sq</span></div>;
								})()}
							</div>
						)}
						<div className="flex flex-wrap gap-1">
							<button type="button" onClick={finishSnapshotPolygon} disabled={activePoints.length<3} className="px-2 py-1 rounded bg-white border hover:bg-gray-50 disabled:opacity-40">Finish</button>
							<button type="button" onClick={clearCurrentSnapshot} disabled={!activePoints.length} className="px-2 py-1 rounded bg-white border hover:bg-gray-50 disabled:opacity-40">Clear Current</button>
							<button type="button" onClick={clearAllSnapshot} disabled={!activePoints.length && !closedPolygons.length} className="px-2 py-1 rounded bg-white border hover:bg-gray-50 disabled:opacity-40">Clear All</button>
							<button type="button" onClick={()=>{ setIsSnapshotMode(false); setActivePoints([]); setClosedPolygons([]); }} className="px-2 py-1 rounded bg-white border hover:bg-gray-50">Exit</button>
						</div>
						<div className="text-[10px] text-gray-600">Captured Heading {snapshotHeading.toFixed(0)}°</div>
					</div>
				)}
				{isSnapshotMode && !showSnapshotPanel && (
					<button type="button" onClick={()=>setShowSnapshotPanel(true)} className="ml-auto px-2 py-1 rounded bg-white/80 backdrop-blur border shadow text-[10px] hover:bg-white">Tools</button>
				)}
			</div>
		{/* Magnifier lens overlay (kept within same stacking context) */}
		{measurementMode && !isSnapshotMode && showMagnifier && isPolygonDrawingMode() && (
			<div style={{ position:'absolute', pointerEvents:'none', left: lensPos.x, top: lensPos.y, width:250, height:250, transform:'translate(-50%, -50%)', borderRadius:'50%', overflow:'hidden', boxShadow:'0 0 0 2px #fff, 0 2px 8px rgba(0,0,0,0.4)', zIndex:50, background:'#000' }}>
				<div ref={magnifierRef} style={{ width:'100%', height:'100%' }} />
				<div style={{ position:'absolute', inset:0, border:'2px solid rgba(255,255,255,0.4)', borderRadius:'50%' }} />
				{/* Crosshair */}
				<div style={{ position:'absolute', left:'50%', top:0, bottom:0, width:1, background:'rgba(255,255,255,0.6)', transform:'translateX(-0.5px)' }} />
				<div style={{ position:'absolute', top:'50%', left:0, right:0, height:1, background:'rgba(255,255,255,0.6)', transform:'translateY(-0.5px)' }} />
				<div style={{ position:'absolute', left:'50%', top:'50%', width:8, height:8, marginLeft:-4, marginTop:-4, borderRadius:'50%', background:'#fff', boxShadow:'0 0 2px rgba(0,0,0,0.6)' }} />
			</div>
		)}
		{/* Active vertex markers & cursor point (overlay inside rotated container) */}
		{measurementMode && !isSnapshotMode && isPolygonDrawingMode() && activePixelPoints.map((pt,i)=> (
			<div key={i}
				style={{ position:'absolute', left: pt.x, top: pt.y, transform:'translate(-50%, -50%) rotate(-'+heading+'deg)', zIndex:30 }}
				onMouseEnter={()=>setHoverVertex(i)} onMouseLeave={()=>setHoverVertex(v=> v===i?null:v)}
			>
				<button type="button"
					style={{ width: i===0?14:10, height: i===0?14:10, borderRadius:'50%', background: i===0? (closeReady? '#16a34a':'#2563eb') : '#1d4ed8', border:'2px solid #fff', boxShadow:'0 1px 3px rgba(0,0,0,0.6)', cursor:'pointer' }}
					onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); if (i===0 && activePath.length>=3) finishActivePolygon(); }}
				/>
				{hoverVertex===i && (
					<div style={{ position:'absolute', top:-18, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,0.7)', color:'#fff', padding:'2px 4px', borderRadius:4, fontSize:10, whiteSpace:'nowrap' }}>Vertex {i+1}</div>
				)}
			</div>
		))}
		{measurementMode && !isSnapshotMode && isPolygonDrawingMode() && cursorPos && (
			<>
				{/* Full-length crosshair lines (rotate with map) */}
				<div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:22 }}>
					<div style={{ position:'absolute', left: cursorPos.x, top:0, width: crosshairThin?1:2, height:'100%', background: crosshairColor, transform:'translateX(-50%)' }} />
					<div style={{ position:'absolute', top: cursorPos.y, left:0, right:0, height: crosshairThin?1:2, background: crosshairColor, transform:'translateY(-50%)' }} />
				</div>
				{/* Cursor point (counter-rotated to stay upright) */}
				<div style={{ position:'absolute', left: cursorPos.x, top: cursorPos.y, transform:'translate(-50%, -50%) rotate(-'+heading+'deg)', width:12, height:12, borderRadius:'50%', background: closeReady? '#16a34a':'#facc15', border:'2px solid #fff', pointerEvents:'none', zIndex:25, boxShadow:'0 1px 4px rgba(0,0,0,0.5)' }} />
			</>
		)}
		{/* Segment length labels */}
		{measurementMode && !isSnapshotMode && isPolygonDrawingMode() && segmentLabels.map((lbl,i)=>(
			<div key={i} style={{ position:'absolute', left: lbl.x, top: lbl.y, transform:'translate(-50%, -50%) rotate(-'+heading+'deg)', background:'rgba(0,0,0,0.65)', color:'#fff', fontSize:10, padding:'2px 4px', borderRadius:4, zIndex:26, pointerEvents:'none', whiteSpace:'nowrap' }}>{lbl.text}</div>
		))}
		{/* Live metrics panel */}
		{measurementMode && !isSnapshotMode && drawingMode==='polygon' && activeMetrics && (
			<div className="absolute bottom-2 left-2 z-30 flex flex-col gap-1">
				<div className="bg-black/60 text-white text-[10px] px-2 py-1 rounded shadow border border-white/10 font-mono space-x-2">
					<span>Pts:{activePath.length}</span>
					<span>Area:{activeMetrics.area>0 ? (activeMetrics.area/9.290304).toFixed(2):'—'}sq</span>
					<span>Perim:{activeMetrics.perim.toFixed(2)}m</span>
				</div>
				<div className="bg-black/50 text-white text-[9px] px-2 py-1 rounded shadow border border-white/10 flex items-center gap-1">
					<span className="opacity-70">Crosshair:</span>
					{['#ffffff','#facc15','#22c55e','#3b82f6','#ef4444'].map(c=> (
						<button key={c} onClick={()=>setCrosshairColor(c==='\#ffffff'?'rgba(255,255,255,0.6)':c)} style={{ background:c, width:14, height:14, borderRadius:4, border: crosshairColor.startsWith(c) ? '2px solid #fff':'1px solid #555' }} />
					))}
					<button onClick={()=>setCrosshairThin(v=>!v)} className="px-1 py-0.5 text-[9px] rounded border bg-white text-black">{crosshairThin?'Thick':'Thin'}</button>
				</div>
			</div>
		)}
		{/* 3D Preview Overlay */}
		{show3DPreview && (
			<div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center">
				<div className="relative w-[70%] h-[70%] rounded shadow-lg overflow-hidden border border-white/20 bg-black">
					<button type="button" onClick={close3DPreview} className="absolute top-2 right-2 z-10 bg-white/90 hover:bg-white text-black rounded px-2 py-1 text-xs shadow border">Close</button>
					<div ref={previewContainerRef} className="absolute inset-0" />
					<div className="absolute bottom-2 left-2 text-xs bg-black/50 text-white px-2 py-1 rounded">3D Preview (read-only)</div>
				</div>
			</div>
		)}
	</div>
);
}
