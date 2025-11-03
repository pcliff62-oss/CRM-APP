"use client";
import { useEffect, useRef, useState } from 'react';

type Props = { address: string; lat?: number | null; lng?: number | null; propertyId?: string | undefined };

declare global { interface Window { google?: any; } }

export default function PropertyMapGoogle({ address, lat, lng, propertyId }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const streetViewRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [initialCenter] = useState<{lat:number;lng:number}|null>(lat && lng ? {lat,lng} : null);
  const [centerPos, setCenterPos] = useState<{lat:number;lng:number}|null>(lat && lng ? {lat,lng} : null);
  const [isStreetView, setIsStreetView] = useState(false);
  const [panoAvailable, setPanoAvailable] = useState<boolean | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

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

  // Load script once
  useEffect(() => {
    if (window.google?.maps) { setReady(true); return; }
    if (!apiKey) { console.warn('Missing Google Maps API key. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (preferred) or GOOGLE_MAPS_API_KEY in your environment.'); return; }
    const existing = document.querySelector('script[data-google-maps]');
    if (existing) { existing.addEventListener('load', () => setReady(true)); return; }
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.dataset.googleMaps = '1';
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, [apiKey]);

  useEffect(() => {
    if (initialCenter) tryDetectStreetView(initialCenter);
  }, [initialCenter, ready]);

  useEffect(() => {
    if (!ready || !ref.current) return;
    if (!window.google?.maps) {
      // script not yet fully loaded
      return;
    }
    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(ref.current, {
        mapTypeId: 'satellite',
        zoom: 19,
        tilt: 0,
        disableDefaultUI: true,
        zoomControl: true,
      });
    }
    // If we have lat/lng (initialCenter) use that first time, but still allow address change to re-geocode
    if (initialCenter && !centerPos) {
      mapRef.current.setCenter(initialCenter);
      markerRef.current = new window.google.maps.Marker({ position: initialCenter, map: mapRef.current });
      setCenterPos(initialCenter);
      return;
    }
    if (!address) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address }, (results: any, status: string) => {
      if (status !== 'OK' || !results?.length) {
        console.warn('Google geocode failed', status);
        return;
      }
      const loc = results[0].geometry.location;
      const pos = { lat: loc.lat(), lng: loc.lng() };
      mapRef.current.setCenter(pos);
      mapRef.current.setZoom(20);
      if (markerRef.current) markerRef.current.setMap(null);
      markerRef.current = new window.google.maps.Marker({ position: pos, map: mapRef.current });
      setCenterPos(pos);
      tryDetectStreetView(pos);
      if (propertyId) {
        fetch('/api/geocode-cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: propertyId, lat: pos.lat, lng: pos.lng }) }).catch(()=>{});
      }
    });
  }, [ready, address, initialCenter, propertyId, centerPos]);

  return (
    <div className="relative w-full h-64 rounded-md overflow-hidden">
      <div ref={ref} className="absolute inset-0" />
      <div className="absolute top-2 right-2 flex flex-col gap-2 z-10">
        <button
          type="button"
          onClick={toggleStreetView}
          disabled={!centerPos || panoAvailable === false}
          className={`px-3 py-1 text-xs rounded bg-white shadow border hover:bg-gray-50 transition disabled:opacity-40`}
          title={panoAvailable === false ? 'No Street View available here' : 'Toggle Street View'}
        >{isStreetView ? 'Map View' : 'Street View'}</button>
      </div>
    </div>
  );
}