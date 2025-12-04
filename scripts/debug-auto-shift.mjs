#!/usr/bin/env node
// Debug script: invoke autoShiftJobs logic for current tenant (requires server auth environment if run inside Next API context)
// Usage: node scripts/debug-auto-shift.mjs <tenantId> <zip>
import fetch from 'node-fetch';

async function main(){
  const tenantId = process.argv[2];
  const zip = process.argv[3];
  if (!tenantId || !zip) {
    console.log('Usage: node scripts/debug-auto-shift.mjs <tenantId> <zip>');
    process.exit(1);
  }
  // call external public APIs directly
  const geoRes = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);
  const geo = await geoRes.json();
  const place = Array.isArray(geo?.places) ? geo.places[0] : null;
  const lat = place ? Number(place.latitude) : NaN;
  const lon = place ? Number(place.longitude) : NaN;
  if (!isFinite(lat) || !isFinite(lon)) {
    console.error('Geocode failed');
    process.exit(2);
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_probability_max&forecast_days=10&timezone=auto`;
  const fcRes = await fetch(url);
  const fc = await fcRes.json();
  const days = fc?.daily?.time || [];
  const precip = fc?.daily?.precipitation_probability_max || [];
  console.log('Forecast (date -> precip %):');
  days.forEach((d,i)=> console.log(d, precip[i]));
  console.log('NOTE: Actual job shifting occurs via POST /api/weather/shift-jobs within authenticated app context.');
}
main();
