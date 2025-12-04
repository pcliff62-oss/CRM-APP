'use client'
import React, { useEffect, useState, useCallback } from 'react';

function apiUrl(path){
  const primary = `/next-api${path}`;
  return typeof window !== 'undefined' ? (window.__NEXT_DATA__ ? path : primary) : primary;
}

export default function WeatherShiftTask(){
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [data, setData] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async ()=>{
    setLoading(true); setError('');
    try {
      let res = await fetch(apiUrl('/api/weather/shift-status'));
      if (!res.ok) res = await fetch('/api/weather/shift-status');
      const json = await res.json().catch(()=>({}));
      if (json?.pending && json?.data) {
        setPending(true); setData(json.data);
      } else { setPending(false); setData(null); }
    } catch(e){ setError('Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=>{ load();
    const handler = ()=> load();
    window.addEventListener('weatherShiftUpdated', handler);
    return ()=> window.removeEventListener('weatherShiftUpdated', handler);
  }, [load]);

  async function handleConfirm(){
    setActionLoading(true); setError('');
    try {
      let res = await fetch(apiUrl('/api/weather/shift-confirm'), { method:'POST' });
      if (!res.ok) res = await fetch('/api/weather/shift-confirm', { method:'POST' });
      await res.json().catch(()=>({}));
      setPending(false); setData(null);
      window.dispatchEvent(new Event('weatherShiftUpdated'));
    } catch { setError('Confirm failed'); }
    finally { setActionLoading(false); }
  }
  async function handleUndo(){
    setActionLoading(true); setError('');
    try {
      let res = await fetch(apiUrl('/api/weather/shift-undo'), { method:'POST' });
      if (!res.ok) res = await fetch('/api/weather/shift-undo', { method:'POST' });
      await res.json().catch(()=>({}));
      setPending(false); setData(null);
      window.dispatchEvent(new Event('weatherShiftUpdated'));
    } catch { setError('Undo failed'); }
    finally { setActionLoading(false); }
  }

  if (loading) return <div className="text-xs text-slate-500">Checking weather shifts…</div>;
  if (!pending) return null;
  const shifted = Number(data?.shifted || 0);
  const processed = Number(data?.processed || 0);
  const shiftDays = Number(data?.shiftDays || 0);
  const firstRain = data?.firstRain || '';
  const createdAt = data?.createdAt ? new Date(data.createdAt) : null;
  const whenStr = createdAt ? createdAt.toLocaleString() : '';
  return (
    <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-xs flex flex-col gap-2">
      <div className="font-semibold text-blue-800">Weather Shift Pending</div>
      <div className="text-blue-900">Shifted {shifted} of {processed} jobs by {shiftDays} day{shiftDays===1?'':'s'} (rain start {firstRain}).</div>
      {whenStr && <div className="text-[11px] text-blue-700">Ran at {whenStr}</div>}
      {error && <div className="text-red-600">{error}</div>}
      <div className="flex gap-2">
        <button disabled={actionLoading} onClick={handleConfirm} className="px-2 py-1 rounded bg-green-600 text-white disabled:opacity-50">{actionLoading?'Working…':'Confirm Shift'}</button>
        <button disabled={actionLoading} onClick={handleUndo} className="px-2 py-1 rounded bg-red-600 text-white disabled:opacity-50">{actionLoading?'Working…':'Undo Shift'}</button>
      </div>
    </div>
  );
}
