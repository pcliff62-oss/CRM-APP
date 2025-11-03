"use client";
import { useEffect, useRef, useState } from "react";

type Props = { address: string; lat?: number | null; lng?: number | null; propertyId?: string };

declare global { interface Window { mapkit?: any; } }

export default function PropertyMapMapKit({ address, lat, lng, propertyId }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [loaded, setLoaded] = useState<boolean>(!!(typeof window !== 'undefined' && (window as any).mapkit));
  const [center] = useState<{ lat: number; lng: number } | null>(lat && lng ? { lat, lng } : null);
  const [geocodeFailed, setGeocodeFailed] = useState(false);

  // Load MapKit JS script once
  useEffect(() => {
    if (window.mapkit) { setLoaded(true); return; }
    const existing = document.querySelector('script[data-mapkit]');
    if (existing) return; // will trigger onload from first mount
    const s = document.createElement("script");
    s.src = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";
    s.async = true;
    s.dataset.mapkit = '1';
    s.onload = () => { console.info("MapKit script loaded"); setLoaded(true); };
    document.head.appendChild(s);
  }, []);

  // Fetch token and init MapKit
  useEffect(() => {
    let cancelled = false;
    async function ensureMap() {
      if (!loaded) return;
      if (!window.mapkit) return; // still loading script
  if (!mapRef.current) {
        console.info("Initializing MapKit map instance");
        const pageUrl = window.location.href;
        let json: any = null;
        try {
          const res = await fetch(`/api/mapkit-token?origin=${encodeURIComponent(pageUrl)}`, { credentials: "same-origin" });
          if (!res.ok) {
            const text = await res.text();
            console.error("MapKit token fetch failed", res.status, text);
            return;
          }
          json = await res.json();
        } catch (err) {
          console.error("MapKit token request error", err);
          return;
        }
        const { token } = json || {};
        if (!token || cancelled) return;
        try {
          const parts = token.split(".");
          if (parts.length >= 2) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
            console.info("MapKit token payload", payload);
          }
        } catch {}
        if (!(window as any)._hytechMapkitInited) {
          window.mapkit.init({ authorizationCallback: (done: (t: string) => void) => done(token) });
          (window as any)._hytechMapkitInited = true;
        }
  mapRef.current = new window.mapkit.Map(ref.current, { showsZoomControl: true, isRotationEnabled: false, mapType: window.mapkit.Map.MapTypes.Satellite });
        mapRef.current.addEventListener("load", () => console.info("MapKit map loaded"));
        mapRef.current.addEventListener("error", (e: any) => console.error("MapKit map error", e));
      }
      // Once map exists, center logic
      if (cancelled || !mapRef.current) return;
      if (center) {
        const coord = new window.mapkit.Coordinate(center.lat, center.lng);
        mapRef.current.region = new window.mapkit.CoordinateRegion(coord, new window.mapkit.CoordinateSpan(0.001, 0.001));
        mapRef.current.addAnnotation(new window.mapkit.MarkerAnnotation(coord, { color: "#10b981" }));
      } else if (address) {
        let raw = address.replace(/\s+/g,' ').trim();
        if (!/\bUSA\b/i.test(raw)) raw += ', USA';
        // FIRST: external geocode (more permissive) then fallback MapKit search for refinement
        let externalUsed = false;
        try {
          console.info('External geocode primary attempt');
          const resp = await fetch(`/api/geocode-external?q=${encodeURIComponent(raw)}`);
          if (!resp.ok) {
            console.warn('External geocode HTTP fail', resp.status);
          } else {
            const data = await resp.json();
            if (data.results?.length) {
              const { lat: elat, lng: elng } = data.results[0];
              const coord = new window.mapkit.Coordinate(elat, elng);
              mapRef.current.region = new window.mapkit.CoordinateRegion(coord, new window.mapkit.CoordinateSpan(0.0007, 0.0007));
              if (mapRef.current.annotations?.length) mapRef.current.removeAnnotations(mapRef.current.annotations);
              mapRef.current.addAnnotation(new window.mapkit.MarkerAnnotation(coord, { color: '#10b981' }));
              externalUsed = true;
              setGeocodeFailed(false);
              if (propertyId) {
                fetch('/api/geocode-cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: propertyId, lat: elat, lng: elng }) }).catch(()=>{});
              }
            } else {
              console.info('External geocode returned no results');
            }
          }
        } catch (e) {
          console.warn('External geocode exception', e);
        }
        if (externalUsed) return; // done

        // MapKit variants only if external failed
        const parts = raw.split(',').map(p => p.trim());
        const variants: string[] = [];
        if (parts.length >= 3) variants.push(raw);
        if (parts.length >= 3) {
          const street = parts[0];
          const city = parts[1];
          const statePostal = parts.find(p => /[A-Z]{2} \d{5}/.test(p)) || '';
          if (street && city && statePostal) variants.push(`${street}, ${city}, ${statePostal}`);
          if (street && city) variants.push(`${street}, ${city}`);
          if (street) variants.push(street);
        }
        const finalVariants = Array.from(new Set(variants.filter(Boolean)));
        console.info('Attempting MapKit variants after external failure', finalVariants);
        const search = new window.mapkit.Search({ getsUserLocation: false });
        const tryVariant = (i: number) => {
          if (i >= finalVariants.length) { console.warn('All geocoding attempts failed'); setGeocodeFailed(true); return; }
          const q = finalVariants[i];
          search.search(q, (error: any, data: any) => {
            if (error || !data?.results?.length) { console.info('MapKit variant failed', q); tryVariant(i+1); return; }
            const item = data.results[0];
            const coord = item.coordinate;
            console.info('MapKit geocode success with', q, coord);
            mapRef.current.region = new window.mapkit.CoordinateRegion(coord, new window.mapkit.CoordinateSpan(0.0007, 0.0007));
            if (mapRef.current.annotations?.length) mapRef.current.removeAnnotations(mapRef.current.annotations);
            mapRef.current.addAnnotation(new window.mapkit.MarkerAnnotation(coord, { color: '#10b981' }));
            setGeocodeFailed(false);
            if (propertyId) {
              fetch('/api/geocode-cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: propertyId, lat: coord.latitude, lng: coord.longitude }) }).catch(()=>{});
            }
          });
        };
        tryVariant(0);
      }
    }
    ensureMap();
    return () => { cancelled = true; };
  }, [loaded, center, address, propertyId]);

  return (
    <div className="relative w-full h-64 rounded-md overflow-hidden">
      <div ref={ref} className="absolute inset-0" />
      {geocodeFailed && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs text-slate-700">
          Could not locate address
        </div>
      )}
    </div>
  );
}
