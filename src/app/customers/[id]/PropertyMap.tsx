"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl, { Map } from "maplibre-gl";

type Props = {
  address: string;
  lat?: number | null;
  lng?: number | null;
};

// Minimal raster style using Esri World Imagery
const satelliteStyle: any = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      ],
      tileSize: 256,
      attribution:
        "Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
    }
  },
  layers: [
    {
      id: "esri",
      type: "raster",
      source: "esri",
      minzoom: 0,
      maxzoom: 22
    }
  ]
};

export default function PropertyMap({ address, lat, lng }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(
    lat && lng ? { lat, lng } : null
  );

  // Geocode on client if no coordinates provided
  useEffect(() => {
    let cancelled = false;
    async function geocode() {
      if (center || !address) return;
      try {
        const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (key) {
          // Google Geocoding
          const resp = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`
          );
          const data = await resp.json();
          const loc = data?.results?.[0]?.geometry?.location;
          if (!cancelled && loc) return setCenter({ lat: loc.lat, lng: loc.lng });
        }
        // Fallback: OpenStreetMap Nominatim (demo use only)
        const osm = await fetch(
          `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: "json", q: address }).toString()}`,
          { headers: { "Accept-Language": "en" } }
        );
        const res = await osm.json();
        const first = Array.isArray(res) ? res[0] : null;
        if (!cancelled && first?.lat && first?.lon) setCenter({ lat: parseFloat(first.lat), lng: parseFloat(first.lon) });
      } catch {}
    }
    geocode();
    return () => {
      cancelled = true;
    };
  }, [address, center]);

  // Initialize map (run once when container is ready)
  const initedRef = useRef(false);
  useEffect(() => {
    if (!containerRef.current || mapRef.current || initedRef.current) return;
    initedRef.current = true;
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: satelliteStyle,
      center: center ? [center.lng, center.lat] : [-98.5795, 39.8283], // USA center
      zoom: center ? 18 : 4
    });
  mapRef.current.on("load", () => setLoaded(true));
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [center]);

  // Update center/marker when we have coordinates
  useEffect(() => {
    if (!mapRef.current || !center) return;
    mapRef.current.setCenter([center.lng, center.lat]);
    mapRef.current.setZoom(19);
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ color: "#10b981" })
        .setLngLat([center.lng, center.lat])
        .addTo(mapRef.current);
    } else {
      markerRef.current.setLngLat([center.lng, center.lat]);
    }
  }, [center]);

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const staticParams: Array<[string, string]> = [
    ["center", center ? `${center.lat},${center.lng}` : address],
    ["zoom", center ? "19" : "16"],
    ["size", "800x280"],
    ["maptype", "satellite"],
    ["key", key || ""]
  ];
  if (center) staticParams.push(["markers", `color:green|${center.lat},${center.lng}`]);
  const staticUrl = key
    ? `https://maps.googleapis.com/maps/api/staticmap?${new URLSearchParams(staticParams).toString()}`
    : null;

  return (
    <div className="relative">
      <div ref={containerRef} className="w-full h-64 rounded-md overflow-hidden" />
      {!loaded && staticUrl && (
  // eslint-disable-next-line @next/next/no-img-element
  <img
          src={staticUrl}
          alt="Satellite preview"
          className="absolute inset-0 w-full h-64 object-cover rounded-md"
        />
      )}
    </div>
  );
}
