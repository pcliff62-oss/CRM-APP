'use client'
import React, { useEffect, useState } from 'react'
import { fetch10DayForecast, isRainRiskDay } from '@/lib/weather'

function apiUrl(path){
  const primary = `/next-api${path}`;
  return typeof window !== 'undefined' ? (window.__NEXT_DATA__ ? path : primary) : primary;
}

// Fetch company postal from API
async function fetchCompanyPostal() {
  try {
    // Try Vite proxy path first, then Next native
    let res = await fetch(apiUrl('/api/company'));
    if (!res.ok) res = await fetch('/api/company');
    const data = await res.json().catch(()=>({}));
    const zip = data?.item?.postal || '';
    return zip;
  } catch { return ''; }
}

export default function WeatherWidget({ className='', onShiftComplete }) {
  const [zip, setZip] = useState('');
  const [loading, setLoading] = useState(true);
  const [forecast, setForecast] = useState([]);
  const [error, setError] = useState('');
  const [shifting, setShifting] = useState(false);
  const [resultMsg, setResultMsg] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const z = await fetchCompanyPostal();
      if (!active) return;
      setZip(z);
      if (!z) { setError('Postal code not set'); setLoading(false); return; }
      const fc = await fetch10DayForecast(z);
      if (!active) return;
      setForecast(fc);
      setLoading(false);
    })();
    return () => { active = false };
  }, []);

  async function handleShiftJobs(){
    try {
      setShifting(true);
      setResultMsg('');
      let res = await fetch(apiUrl('/api/weather/shift-jobs'), { method: 'POST' });
      if (!res.ok) res = await fetch('/api/weather/shift-jobs', { method: 'POST' });
      const data = await res.json().catch(()=>({}));
      if (data?.ok) {
        const msg = `Shifted ${data.shifted||0} of ${data.processed||0} jobs (ZIP ${data.zip||zip}).`;
        setResultMsg(msg);
        try { localStorage.setItem('weatherShiftLastMsg', msg); window.dispatchEvent(new Event('weatherShiftUpdated')); } catch {}
        onShiftComplete && onShiftComplete(msg);
      } else {
        const msg = `Shift failed: ${data?.error||'Unknown error'}`;
        setResultMsg(msg);
        try { localStorage.setItem('weatherShiftLastMsg', msg); window.dispatchEvent(new Event('weatherShiftUpdated')); } catch {}
        onShiftComplete && onShiftComplete(msg);
      }
    } catch (e) {
      const msg = `Shift failed.`;
      setResultMsg(msg);
      try { localStorage.setItem('weatherShiftLastMsg', msg); window.dispatchEvent(new Event('weatherShiftUpdated')); } catch {}
      onShiftComplete && onShiftComplete(msg);
    } finally {
      setShifting(false);
    }
  }

  function formatDateLabel(iso) {
    try {
      // Parse YYYY-MM-DD without timezone shift: construct local date components
      const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
      return d.toLocaleDateString(undefined, { weekday: 'short', month:'numeric', day:'numeric' });
    } catch { return iso; }
  }
  function codeToEmoji(code) {
    if (code === 0) return '☀️';
    if ([1,2].includes(code)) return '⛅';
    if (code === 3) return '☁️';
    if ([51,53,55].includes(code)) return '🌦️';
    if ([61,63,65].includes(code)) return '🌧️';
    if ([71,73,75,77].includes(code)) return '❄️';
    if ([80,81,82].includes(code)) return '🌧️';
    if ([95,96,99].includes(code)) return '⛈️';
    return '🌤️';
  }

  return (
    <div className={'rounded-2xl border border-neutral-200 bg-white shadow-sm p-4 '+className}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-base font-semibold">10-Day Weather</div>
        {zip && <div className="text-xs text-neutral-600">ZIP {zip}</div>}
      </div>
      {loading ? (
        <div className="text-sm text-neutral-500">Loading forecast…</div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : forecast.length === 0 ? (
        <div className="text-sm text-neutral-500">No data.</div>
      ) : (
        <div className="grid grid-cols-5 gap-2 text-xs">
          {forecast.map(f => {
            const todayIso = (()=>{ const now=new Date(); return now.toISOString().slice(0,10); })();
            const isToday = f.date === todayIso;
            const rain = isRainRiskDay(f);
            const cls = rain ? 'bg-blue-50 border border-blue-200' : 'bg-neutral-50 border border-neutral-200';
            const todayRing = isToday ? ' ring-2 ring-emerald-400 ring-offset-2' : '';
            return (
            <div key={f.date} className={'flex flex-col items-center rounded-lg px-2 py-2 '+cls+todayRing}>
              <div className="flex items-center gap-1">
                <span>{formatDateLabel(f.date)}</span>
                {isToday && <span className="inline-block px-1 py-0.5 text-[10px] rounded bg-emerald-500 text-white">Today</span>}
              </div>
              <div className="text-xl leading-none mt-1">{codeToEmoji(f.code)}</div>
              <div className="mt-1 font-semibold">{f.precipProb}%</div>
              <div className="mt-0.5 text-neutral-600">{f.tempMax?.toFixed?.(0)}°F / {f.tempMin?.toFixed?.(0)}°F</div>
            </div>
          )})}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={handleShiftJobs} disabled={shifting} className="rounded-xl px-3 py-1.5 border text-sm bg-blue-600 text-white disabled:opacity-50">
          {shifting ? 'Shifting…' : 'Shift Jobs for Rainy Days'}
        </button>
        {resultMsg && <div className="text-xs text-neutral-600">{resultMsg}</div>}
      </div>
      <div className="mt-3 text-[11px] text-neutral-500">Days highlighted indicate ≥70% precipitation probability; jobs may auto-shift.</div>
    </div>
  );
}
