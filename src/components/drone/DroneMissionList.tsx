"use client";
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Waypoint {
  id: string;
  order: number;
  lat: number;
  lng: number;
  altitudeFt: number | null;
  gimbalPitch: number | null;
  gimbalYaw: number | null;
}

interface DroneMission {
  id: string;
  title: string;
  createdAt: string;
  altitudeFt: number | null;
  frontOverlap: number | null;
  sideOverlap: number | null;
  captureMode: string | null;
  pitchDeg: number | null;
  photoCountEst: number | null;
  waypoints: Waypoint[];
}

interface Props {
  contactId?: string;
  propertyId?: string;
  leadId?: string;
  limit?: number;
}

export const DroneMissionList: React.FC<Props> = ({ contactId, propertyId, leadId, limit = 5 }) => {
  const [missions, setMissions] = useState<DroneMission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (contactId) params.append('contactId', contactId);
    if (propertyId) params.append('propertyId', propertyId);
    if (leadId) params.append('leadId', leadId);
    setLoading(true);
    fetch(`/api/drone-missions?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setMissions(data.missions.slice(0, limit));
        setError(null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [contactId, propertyId, leadId, limit]);

  const handleExport = async (id: string) => {
    const res = await fetch(`/api/drone-missions/${id}/export`);
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mission-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Drone Missions</h3>
        {loading && <span className="text-xs text-muted-foreground">Loading...</span>}
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {missions.length === 0 && !loading && <div className="text-xs text-muted-foreground">No missions yet.</div>}
      <ul className="space-y-2">
        {missions.map(m => (
          <li key={m.id} className="border rounded p-2 text-xs space-y-1">
            <div className="flex justify-between gap-2">
              <span className="font-medium truncate max-w-[50%]" title={m.title}>{m.title}</span>
              <div className="flex gap-2">
                <a href={`/drone-missions/${m.id}/photos`} className="inline-flex items-center px-2 py-1 text-xs rounded border hover:bg-muted">Photos</a>
                <Button size="sm" variant="secondary" onClick={() => handleExport(m.id)}>Export</Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              {m.altitudeFt != null && <span>Alt: {m.altitudeFt}ft</span>}
              {m.frontOverlap != null && <span>FO: {m.frontOverlap}%</span>}
              {m.sideOverlap != null && <span>SO: {m.sideOverlap}%</span>}
              {m.photoCountEst != null && <span>Est: {m.photoCountEst} photos</span>}
              <span>WP: {m.waypoints.length}</span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {new Date(m.createdAt).toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
};

export default DroneMissionList;
