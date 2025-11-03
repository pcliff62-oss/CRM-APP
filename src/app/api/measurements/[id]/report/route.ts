import { NextRequest, NextResponse } from 'next/server';
// @ts-ignore - pdf-lib lacks bundled TypeScript types in this project context
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import prisma from '@/lib/db';
import { promises as fs } from 'fs';
import path from 'path';
import { getGcs, gcsPublicUrl } from '@/lib/gcs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';

function polygonArea(points: number[][]) { let a=0; for (let i=0;i<points.length;i++){ const [x1,y1]=points[i]; const [x2,y2]=points[(i+1)%points.length]; a += x1*y2 - x2*y1; } return Math.abs(a)/2; }

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  try {
    const body = await req.json();
    const { features: rawFeatures = [], totals = {}, imageRotationDeg = 0, accessoryBreakdown = {}, planeSummaries = [], originalImageData, saveToFiles = false } = body || {};
    // Normalize features: only accept Polygon with coordinates
    const features = Array.isArray(rawFeatures)
      ? rawFeatures.filter((f:any)=> f && f.geometry && f.geometry.type==='Polygon' && Array.isArray(f.geometry.coordinates) && Array.isArray(f.geometry.coordinates[0]))
      : [];

    // Edge color palette (mirrors editor EDGE_COLORS)
    const EDGE_COLORS: Record<string,string> = {
      eave: '#2dd4bf',
      rake: '#60a5fa',
      ridge: '#f97316',
      valley: '#f43f5e',
      hip: '#a78bfa',
      flashing: '#f59e0b',
      parapet: '#10b981',
  transition: '#ec4899',
      unknown: '#9ca3af'
    };

    // Fetch measurement to access gsd for accurate length conversion and derive address for header
    let gsdMPerPx = 0; // meters per pixel
    let addressLine = '';
    try {
      const measurement = await prisma.measurement.findUnique({
        where: { id: params.id },
        include: { property: true, lead: { include: { property: true } } }
      });
      if (measurement && typeof measurement.gsdMPerPx === 'number') gsdMPerPx = measurement.gsdMPerPx;
      const prop = measurement?.property || measurement?.lead?.property || null;
      if (prop) {
        const line1 = [prop.address1, prop.address2].filter(Boolean).join(' ').trim();
        const cityStatePostal = [prop.city, [prop.state, prop.postal].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        addressLine = [line1, cityStatePostal].filter(Boolean).join(', ');
      }
    } catch {}
    const M_TO_FT = 3.28084;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // Format: date MM-DD-YYYY (no time)
  const now = new Date();
  const pad = (n:number)=> String(n).padStart(2,'0');
  const dateStr = `${pad(now.getMonth()+1)}-${pad(now.getDate())}-${now.getFullYear()}`;

  // Precompute rotated geometry bounds BEFORE using on first page
  const angleRad = (imageRotationDeg || 0) * Math.PI/180;
  const cosR = Math.cos(angleRad); const sinR = Math.sin(angleRad);
  let rawMinX=Infinity, rawMinY=Infinity, rawMaxX=-Infinity, rawMaxY=-Infinity;
  features.forEach((f:any)=> f.geometry.coordinates[0].forEach((p:number[])=>{ if(p[0]<rawMinX)rawMinX=p[0]; if(p[1]<rawMinY)rawMinY=p[1]; if(p[0]>rawMaxX)rawMaxX=p[0]; if(p[1]>rawMaxY)rawMaxY=p[1]; }));
  const cx0=(rawMinX+rawMaxX)/2, cy0=(rawMinY+rawMaxY)/2;
  const rotated = features.map((f:any)=>{ const ring=f.geometry.coordinates[0]; const rr=ring.map((pt:number[])=>{ const x=pt[0]-cx0; const y=pt[1]-cy0; return [ x*cosR - y*sinR + cx0, x*sinR + y*cosR + cy0 ];}); return { ...f, geometry:{ type:'Polygon', coordinates:[rr] } };});
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  rotated.forEach((f:any)=> f.geometry.coordinates[0].forEach((p:number[])=>{ if(p[0]<minX)minX=p[0]; if(p[1]<minY)minY=p[1]; if(p[0]>maxX)maxX=p[0]; if(p[1]>maxY)maxY=p[1]; }));
  // Safety fallback: if no features or invalid bounds, use a sane default box to avoid NaNs
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    minX = 0; minY = 0; maxX = 1; maxY = 1;
  }
  const spanX = maxX-minX || 1; const spanY = maxY-minY || 1;

  // Helper: point-in-polygon for overlap detection
  function pip(x:number, y:number, ring:number[][]){ let inside=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++) { const xi=ring[i][0], yi=ring[i][1]; const xj=ring[j][0], yj=ring[j][1]; const intersect=((yi>y)!==(yj>y)) && (x < ((xj-xi)*(y-yi))/((yj-yi)||1e-9) + xi); if (intersect) inside=!inside; } return inside; }
  // Layer ordering: derive from layerId alphabetical (fallback to 'A')
  const layerIds = Array.from(new Set(rotated.map((f:any)=> (f.properties?.layerId || 'A') as string))).sort((a:string,b:string)=> a.localeCompare(b));
  const layerOrder = new Map<string, number>(); layerIds.forEach((id,idx)=> layerOrder.set(id, idx));
  const rotatedWithOrder = rotated.map((f:any, idx:number)=> ({ idx, order: layerOrder.get(f.properties?.layerId||'A')||0, ring: f.geometry.coordinates[0] as number[][], f }));
  // Given a feature index, get higher-layer rings
  // Higher priority: alphabetically earlier layers (A above B above C). So rings with lower order are considered "higher".
  const higherRingsFor = (order:number)=> rotatedWithOrder.filter(r=> r.order < order).map(r=> r.ring);
  // Draw a segment, splitting overlapped portions into dotted sub-segments
  function drawSegmentWithOverlap(page:any, a:number[], b:number[], colorRgb:{r:number,g:number,b:number}, thickness:number, tx:(x:number)=>number, ty:(y:number)=>number, higherRings:number[][][]){
    const steps = 64; // sampling resolution
    const pts:{x:number;y:number;inside:boolean;t:number}[] = [];
    for(let i=0;i<=steps;i++){
      const t=i/steps; const x=a[0]*(1-t)+b[0]*t; const y=a[1]*(1-t)+b[1]*t;
      let inside=false; for(const ring of higherRings){ if (pip(x,y,ring)) { inside=true; break; } }
      pts.push({ x: tx(x), y: ty(y), inside, t });
    }
    // Collapse into runs
    let i=0; const rgbCol = rgb(colorRgb.r/255,colorRgb.g/255,colorRgb.b/255);
    while(i<pts.length-1){
      const start = i; const inside = pts[i].inside; while(i<pts.length-1 && pts[i+1].inside===inside) i++; const end=i; // inclusive
      const p0=pts[start], p1=pts[end];
      if (!inside){
        // draw solid segment from p0 to p1
        page.drawLine({ start:{x:p0.x,y:p0.y}, end:{x:p1.x,y:p1.y}, thickness, color: rgbCol });
      } else {
        // draw dotted: small segments with gaps
        const dashCount = Math.max(1, Math.round((end-start)/6));
        const seg = (p1.t - p0.t) / (dashCount*2);
        for(let k=0;k<dashCount;k++){
          const tA = p0.t + k*2*seg; const tB = Math.min(p0.t + (k*2+1)*seg, p1.t);
          const xa = tx(a[0]*(1-tA)+b[0]*tA), ya = ty(a[1]*(1-tA)+b[1]*tA);
          const xb = tx(a[0]*(1-tB)+b[0]*tB), yb = ty(a[1]*(1-tB)+b[1]*tB);
          page.drawLine({ start:{x:xa,y:ya}, end:{x:xb,y:yb}, thickness, color: rgbCol });
        }
      }
      i++;
    }
  }

  // PAGE 1: Detailed plan with color-coded edge lengths and totals bar
  const pagePlan = pdf.addPage([612,792]);
  const { width: W, height: H } = pagePlan.getSize();
  pagePlan.drawText('Roof Measurement', { x:28, y:H-40, size:22, font: fontBold, color: rgb(0,0.45,0.75) });
  pagePlan.drawText(dateStr, { x:28, y:H-56, size:8, font });
  // Move address above totals row to avoid overlap
  pagePlan.drawText(`Address: ${addressLine || params.id}`, { x:28, y:H-68, size:8, font });

    // Totals bar (edge totals)
    const edgeTotals: Record<string, number> = { ...(totals.edgeTotalsFt || {}) } as any;
    if (!totals.edgeTotalsFt) {
      rotated.forEach((f:any)=>{
        const ring = f.geometry.coordinates[0];
        const edgesArr = (f.properties?.edges || []) as { i:number; type:string }[];
        for (let i=0;i<ring.length;i++) {
          const a = ring[i]; const b = ring[(i+1)%ring.length];
          const pxLen = Math.hypot(b[0]-a[0], b[1]-a[1]);
            const ftLen = gsdMPerPx>0 ? pxLen * gsdMPerPx * M_TO_FT : pxLen;
            const type = edgesArr.find(e=> e.i===i)?.type || 'unknown';
            edgeTotals[type] = (edgeTotals[type]||0) + ftLen;
        }
      });
    }
  const order = ['eave','rake','ridge','valley','hip','flashing','parapet','transition','unknown'];
    let xCursor = 28; let yCursor = H-90; const itemPad=6; const rowHeight=18; const maxRowWidth = 612-56;
    function hexToRgb(hex:string){ const h=hex.replace('#',''); const b=parseInt(h,16); if(h.length===6){ return { r:(b>>16)&255, g:(b>>8)&255, b:b&255 }; } return { r:128,g:128,b:128 }; }
    order.filter(t=> edgeTotals[t]>0).forEach(type=>{
      const colorHex = EDGE_COLORS[type] || '#999999';
      const label = `${type}: ${edgeTotals[type].toFixed(1)} ft`;
      const tw = font.widthOfTextAtSize(label,9);
      const boxW = tw + itemPad*2;
      if (xCursor + boxW > maxRowWidth) { xCursor = 28; yCursor -= rowHeight; }
      pagePlan.drawRectangle({ x:xCursor, y:yCursor-4, width: boxW, height: rowHeight-4, color: rgb(0.97,0.98,0.99), borderColor: rgb(0.85,0.9,0.95), borderWidth:1 });
      const col = hexToRgb(colorHex);
      pagePlan.drawText(label, { x:xCursor+itemPad, y:yCursor+2, size:9, font: fontBold, color: rgb(col.r/255,col.g/255,col.b/255) });
      xCursor += boxW + 8;
    });
    let metricsY = yCursor - 24;
    if (typeof totals.totalSquares === 'number') { pagePlan.drawText(`Total Squares: ${totals.totalSquares.toFixed(2)}`, { x:28, y: metricsY, size:10, font: fontBold }); metricsY -= 14; }
    if (typeof totals.totalPerimeterFt === 'number') { pagePlan.drawText(`Perimeter: ${totals.totalPerimeterFt.toFixed(1)} ft`, { x:28, y: metricsY, size:10, font: fontBold }); metricsY -= 14; }
    // Predominant pitch by area (weighted by polygon area proportion)
    try {
      const areaEntries: { pitch:number; area:number }[] = rotated.map((f:any)=>({ pitch: f.properties?.pitch ?? 0, area: polygonArea(f.geometry.coordinates[0]) }));
      const areaByPitch: Record<string, number> = {};
      areaEntries.forEach(e=> { areaByPitch[e.pitch] = (areaByPitch[e.pitch]||0) + e.area; });
      const predominant = Object.entries(areaByPitch).sort((a,b)=> b[1]-a[1])[0];
      if (predominant) { const pp = predominant[0]; pagePlan.drawText(`Predominant Pitch: ${pp}/12`, { x:28, y: metricsY, size:10, font: fontBold }); metricsY -= 14; }
    } catch {}

    // Drawing box
    const drawBox = { x:40, y: 80, w: 532, h: metricsY - 100 };
    if (drawBox.h < 320) drawBox.h = 320;
    pagePlan.drawRectangle({ x: drawBox.x, y: drawBox.y, width: drawBox.w, height: drawBox.h, borderColor: rgb(0.85,0.9,0.95), borderWidth:1 });
    const scalePlan = Math.min(drawBox.w/spanX, drawBox.h/spanY)*0.9;
    const offXPlan = drawBox.x + (drawBox.w - spanX*scalePlan)/2;
    const offYPlan = drawBox.y + (drawBox.h - spanY*scalePlan)/2;
    const txPlan = (x:number)=> offXPlan + (x-minX)*scalePlan;
    const tyPlan = (y:number)=> offYPlan + (maxY - y)*scalePlan;
    // Draw edges with labels
  rotatedWithOrder.slice().sort((a:any,b:any)=> b.order - a.order).forEach(({f, order: ord, ring}:any)=>{
      const edgesArr = (f.properties?.edges || []) as { i:number; type:string }[];
      const higher = higherRingsFor(ord);
      for (let i=0;i<ring.length;i++) {
        const a = ring[i]; const b = ring[(i+1)%ring.length];
        const type = edgesArr.find(e=> e.i===i)?.type || 'unknown';
        const colorHex = EDGE_COLORS[type] || '#666666';
        const col = hexToRgb(colorHex);
        drawSegmentWithOverlap(pagePlan, a, b, col, 1.4, txPlan, tyPlan, higher);
        const midx = (a[0]+b[0])/2; const midy = (a[1]+b[1])/2;
        const pxLen = Math.hypot(b[0]-a[0], b[1]-a[1]);
        let label:string;
        if (gsdMPerPx>0) {
          let ft = pxLen * gsdMPerPx * M_TO_FT;
          // Slope adjust rakes, valleys, and hips
          if (type==='rake' || type==='valley' || type==='hip') {
            const pitch = typeof f.properties?.pitch === 'number' ? f.properties.pitch : 0;
            const mult = 1/Math.cos((pitch/12)||0);
            if (Number.isFinite(mult) && mult>0) ft *= mult;
          }
          label = ft < 10 ? ft.toFixed(2)+' ft' : ft.toFixed(1)+' ft';
        } else {
          label = pxLen.toFixed(0)+' px';
        }
        const dx = b[0]-a[0]; const dy = b[1]-a[1]; const len = Math.hypot(dx,dy)||1; const ux=-dy/len; const uy=dx/len; const offset=6;
        const lx = txPlan(midx) + ux*offset; const ly = tyPlan(midy) + uy*offset; const tw = font.widthOfTextAtSize(label,7);
        pagePlan.drawRectangle({ x: lx - tw/2 - 2, y: ly - 4, width: tw + 4, height: 10, color: rgb(1,1,1), opacity: 0.85 });
        pagePlan.drawText(label, { x: lx - tw/2, y: ly - 2, size:7, font: fontBold, color: rgb(col.r/255,col.g/255,col.b/255) });
      }
    });
    // Original image thumbnail
    if (originalImageData && typeof originalImageData === 'string') {
      try { const imgBase64 = originalImageData.split(',')[1] || originalImageData; const imgBytes = Uint8Array.from(Buffer.from(imgBase64,'base64')); let img; if(/png/i.test(originalImageData)) img=await pdf.embedPng(imgBytes); else img=await pdf.embedJpg(imgBytes); const iw=img.width, ih=img.height; const maxW=140,maxH=110; const sc=Math.min(maxW/iw,maxH/ih); const dw=iw*sc, dh=ih*sc; pagePlan.drawImage(img,{ x:drawBox.x+drawBox.w-dw-8, y: drawBox.y+8, width:dw, height:dh, rotate:{ type:'degrees', angle: imageRotationDeg||0 } as any }); pagePlan.drawText('Original',{ x:drawBox.x+drawBox.w-dw-4, y: drawBox.y+8+dh+2, size:8, font }); } catch {}
    }


  // PAGE 2: Areas
  const page2 = pdf.addPage([612,792]);
  page2.drawText('Roof Areas', { x:28, y: H-50, size: 20, font: fontBold, color: rgb(0,0.45,0.75) });
    // Compute pitched vs low pitched totals (>2 is pitched)
    let totalPxAll = 0; let pitchedPx = 0; let lowPx = 0;
    rotated.forEach((f:any)=> { const a = polygonArea(f.geometry.coordinates[0]); totalPxAll += a; const p = f.properties?.pitch ?? 0; if (p>2) pitchedPx += a; else lowPx += a; });
    // Convert pixel areas to ft^2 if totalSquares available (distribute proportionally like per-polygon labels)
    let pitchedFt2: number | null = null, lowFt2: number | null = null;
    if (typeof totals.totalSquares === 'number' && totalPxAll>0) {
      const totalFt2 = totals.totalSquares * 100; // squares to ft^2
      pitchedFt2 = (pitchedPx/totalPxAll) * totalFt2;
      lowFt2 = (lowPx/totalPxAll) * totalFt2;
    }
    let areaMetricsY = H-70 - 16; // below title
    if (pitchedFt2!=null) {
  page2.drawText(`Total Pitched Roof Area (>2/12): ${pitchedFt2.toFixed(0)} SqFt.`, { x:28, y: areaMetricsY, size:10, font: fontBold }); areaMetricsY -= 14;
  page2.drawText(`Total Low Pitched Roof Area (<=2/12): ${lowFt2!.toFixed(0)} SqFt.`, { x:28, y: areaMetricsY, size:10, font: fontBold }); areaMetricsY -= 18;
    } else {
      page2.drawText(`Total Pitched Roof Area (>2/12): ${pitchedPx.toFixed(0)} px^2`, { x:28, y: areaMetricsY, size:10, font: fontBold }); areaMetricsY -= 14;
      page2.drawText(`Total Low Pitched Roof Area (<=2/12): ${lowPx.toFixed(0)} px^2`, { x:28, y: areaMetricsY, size:10, font: fontBold }); areaMetricsY -= 18;
    }
    // shift area drawing box down if needed
    const areaBoxTop = areaMetricsY;
  const areaBox = { x: 40, y: 80, w: 532, h: areaBoxTop - 90 };
  if (areaBox.h < 420) areaBox.h = 420;
    page2.drawRectangle({ x: areaBox.x, y: areaBox.y, width: areaBox.w, height: areaBox.h, borderColor: rgb(0.85,0.9,0.95), borderWidth:1 });
    const scale2 = Math.min(areaBox.w/spanX, areaBox.h/spanY)*0.9;
    const offX2 = areaBox.x + (areaBox.w - spanX*scale2)/2;
    const offY2 = areaBox.y + (areaBox.h - spanY*scale2)/2;
    const tx2 = (x:number)=> offX2 + (x-minX)*scale2;
    const ty2 = (y:number)=> offY2 + (maxY - y)*scale2;
    // Draw outlines with overlap-aware dotted rendering, then add area labels per polygon
    rotatedWithOrder.slice().sort((a:any,b:any)=> b.order - a.order).forEach(({ f, ring, order: ord }: any) => {
      const higher = higherRingsFor(ord);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        drawSegmentWithOverlap(page2, a, b, { r: 38, g: 140, b: 204 }, 1, tx2, ty2, higher);
      }
      const areaPx = polygonArea(ring);
      let areaFt2: number | null = null;
      if (typeof totals.totalSquares === 'number' && totals.totalSquares > 0) {
        // Distribute using pitch-weighted projected areas (surface proportion)
        const weights = rotated.map((rf:any)=>{
          const apx = polygonArea(rf.geometry.coordinates[0]);
          const pitch = typeof rf.properties?.pitch === 'number' ? rf.properties.pitch : 0;
          const mult = 1/Math.cos((pitch/12)||0);
          return apx * (Number.isFinite(mult)&&mult>0? mult: 1);
        });
        const totalW = weights.reduce((s:number,v:number)=> s+v, 0);
        if (totalW > 0) {
          const pitch = typeof f.properties?.pitch === 'number' ? f.properties.pitch : 0;
          const mult = 1/Math.cos((pitch/12)||0) || 1;
          const w = areaPx * (Number.isFinite(mult)&&mult>0? mult: 1);
          areaFt2 = (w / totalW) * (totals.totalSquares * 100);
        }
      }
      const cx = ring.reduce((s: number, p: number[]) => s + p[0], 0) / ring.length;
      const cy = ring.reduce((s: number, p: number[]) => s + p[1], 0) / ring.length;
      const lx = tx2(cx); const ly = ty2(cy);
      const label = areaFt2 != null ? `${areaFt2.toFixed(0)} SqFt.` : `${areaPx.toFixed(0)} px^2`;
      page2.drawText(label, { x: lx - (label.length * 3), y: ly - 4, size: 10, font: fontBold, color: rgb(0.05, 0.2, 0.35) });
    });

  // PAGE 3: Pitches
  const page3 = pdf.addPage([612,792]);
  page3.drawText('Pitches', { x:28, y: H-50, size: 20, font: fontBold, color: rgb(0,0.45,0.75) });
    const pitchBox = { x: 40, y: 80, w: 532, h: 620 };
    page3.drawRectangle({ x: pitchBox.x, y: pitchBox.y, width: pitchBox.w, height: pitchBox.h, borderColor: rgb(0.85,0.9,0.95), borderWidth:1 });
    const scale3 = Math.min(pitchBox.w/spanX, pitchBox.h/spanY)*0.9;
    const offX3 = pitchBox.x + (pitchBox.w - spanX*scale3)/2;
    const offY3 = pitchBox.y + (pitchBox.h - spanY*scale3)/2;
    const tx3 = (x:number)=> offX3 + (x-minX)*scale3;
    const ty3 = (y:number)=> offY3 + (maxY - y)*scale3;
  rotatedWithOrder.slice().sort((a:any,b:any)=> b.order - a.order).forEach(({f, ring, order: ord}:any)=>{
      const higher = higherRingsFor(ord);
      for (let i=0;i<ring.length;i++){
        const a=ring[i]; const b=ring[(i+1)%ring.length];
        drawSegmentWithOverlap(page3, a, b, { r:38,g:140,b:204 }, 1, tx3, ty3, higher);
      }
      // centroid
      const cx = ring.reduce((s:number,p:number[])=> s+p[0],0)/ring.length;
      const cy = ring.reduce((s:number,p:number[])=> s+p[1],0)/ring.length;
      const pitch = f.properties?.pitch ?? 0;
      const lx = tx3(cx); const ly = ty3(cy);
      const label = pitch ? `${pitch}/12` : 'flat';
      page3.drawText(label, { x: lx- (label.length*3), y: ly-4, size: 10, font: fontBold, color: rgb(0.05,0.2,0.35) });
    });
  
  // PAGE 4: Accessories (plain outline + accessory symbols + table)
  if (accessoryBreakdown && Object.keys(accessoryBreakdown).length > 0) {
    const page4 = pdf.addPage([612,792]);
    const H4 = 792; const W4 = 612;
    page4.drawText('Accessories', { x:28, y: H4-50, size: 20, font: fontBold, color: rgb(0,0.45,0.75) });
    // Drawing area top half
    const accBox = { x:40, y: 390, w: 532, h: 300 };
    page4.drawRectangle({ x: accBox.x, y: accBox.y, width: accBox.w, height: accBox.h, borderColor: rgb(0.85,0.9,0.95), borderWidth:1 });
    const scaleAcc = Math.min(accBox.w/spanX, accBox.h/spanY)*0.9;
    const offXAcc = accBox.x + (accBox.w - spanX*scaleAcc)/2;
    const offYAcc = accBox.y + (accBox.h - spanY*scaleAcc)/2;
    const txAcc = (x:number)=> offXAcc + (x-minX)*scaleAcc;
    const tyAcc = (y:number)=> offYAcc + (maxY - y)*scaleAcc;
    // Plain outlines
  rotatedWithOrder.slice().sort((a:any,b:any)=> b.order - a.order).forEach(({ring, order: ord}:any)=>{
      const higher = higherRingsFor(ord);
      for (let i=0;i<ring.length;i++) {
        const a=ring[i], b=ring[(i+1)%ring.length];
        drawSegmentWithOverlap(page4, a, b, {r:51,g:51,b:51}, 1, txAcc, tyAcc, higher);
      }
    });
    // Draw accessories from features (positions rotated already in 'rotated')
    rotated.forEach((f:any)=>{
      const ring = f.geometry.coordinates[0]; // For centroid if needed
      const accs: any[] = f.properties?.accessories || [];
      accs.forEach(acc => {
        const x = txAcc(acc.x); const y = tyAcc(acc.y);
        // symbol (circle) and label
        page4.drawCircle({ x, y, size: 4, color: rgb(0.95,0.95,0.95), borderColor: rgb(0.1,0.5,0.7), borderWidth:1 });
        // Prefer the selected input/value over the broad category for the label
        let lbl: string = '';
        if (acc.type === 'Skylight') {
          lbl = (acc.data?.size ? String(acc.data.size).toUpperCase() : '') || 'Skylight';
        } else if (acc.type === 'Vents') {
          const opts = Array.isArray(acc.data?.options) ? acc.data.options : [];
          lbl = opts.length ? opts.join(', ') : 'Vents';
        } else if (acc.type === 'Pipe flange') {
          lbl = (acc.data?.size || '').toString() || 'Pipe flange';
        } else if (acc.type === 'Other') {
          lbl = (acc.data?.note || '').toString() || 'Other';
        } else {
          lbl = acc.type || '';
        }
        page4.drawText(lbl, { x: x+6, y: y-3, size:8, font: fontBold, color: rgb(0.1,0.4,0.55) });
      });
    });
    // Table header
    let tableY = 340;
    page4.drawText('Breakdown', { x:40, y: tableY, size:12, font: fontBold, color: rgb(0.1,0.4,0.55) });
    tableY -= 16;
    const colXType = 40; const colXVariant = 210; const colXCount = 470;
    const headerColor = rgb(0.9,0.94,0.97);
    page4.drawRectangle({ x: colXType-4, y: tableY-4, width: colXCount-colXType+100, height: 20, color: headerColor });
    page4.drawText('Type', { x: colXType, y: tableY+2, size:9, font: fontBold });
    page4.drawText('Variant', { x: colXVariant, y: tableY+2, size:9, font: fontBold });
    page4.drawText('Count', { x: colXCount, y: tableY+2, size:9, font: fontBold });
    tableY -= 24;
    const sortedTypes = Object.keys(accessoryBreakdown).sort((a,b)=> a.localeCompare(b));
    sortedTypes.forEach(type => {
      const variants = Object.entries(accessoryBreakdown[type as any] as Record<string,number>).sort((a,b)=> a[0].localeCompare(b[0]));
      variants.forEach(([variant,count], idx) => {
        const rowH = 16;
        const bg = idx % 2 === 0 ? rgb(1,1,1) : rgb(0.98,0.985,0.99);
        page4.drawRectangle({ x: colXType-4, y: tableY-2, width: colXCount-colXType+100, height: rowH, color: bg });
        page4.drawText(type, { x: colXType, y: tableY+2, size:8, font });
        page4.drawText(variant, { x: colXVariant, y: tableY+2, size:8, font });
        page4.drawText(String(count), { x: colXCount, y: tableY+2, size:8, font });
        tableY -= rowH;
      });
      tableY -= 4; // spacing after group
    });
  }

  // PAGE 5: Final Summary (sample style)
  // We'll reuse geometry to draw a simplified outline left, metrics right, waste factor matrix bottom.
  const page5 = pdf.addPage([612,792]);
  const { height: H5 } = page5.getSize();
  page5.drawText('Report summary', { x:20, y: H5-50, size:18, font: fontBold, color: rgb(0,0.45,0.75) });
  // Address line (fallback to ID if address not available)
  page5.drawText(`Address: ${addressLine || params.id}`, { x:20, y: H5-66, size:9, font });
  // Left drawing box
  const sumBox = { x:30, y: H5-430, w: 260, h: 250 };
  page5.drawRectangle({ x: sumBox.x, y: sumBox.y, width: sumBox.w, height: sumBox.h, borderColor: rgb(0.85,0.9,0.95), borderWidth:1 });
  const scaleSum = Math.min(sumBox.w/spanX, sumBox.h/spanY)*0.9;
  const offXSum = sumBox.x + (sumBox.w - spanX*scaleSum)/2;
  const offYSum = sumBox.y + (sumBox.h - spanY*scaleSum)/2;
  const txSum = (x:number)=> offXSum + (x-minX)*scaleSum;
  const tySum = (y:number)=> offYSum + (maxY - y)*scaleSum;
  // Overlap-aware outline for summary too
  rotatedWithOrder.slice().sort((a:any,b:any)=> b.order - a.order).forEach(({ ring, order: ord }: any) => {
    const higher = higherRingsFor(ord);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]; const b = ring[(i + 1) % ring.length];
      drawSegmentWithOverlap(page5, a, b, { r: 26, g: 119, b: 158 }, 1, txSum, tySum, higher);
    }
  });

  // Metrics list (mirroring earlier summary plus extended values if available)
  const metricStartX = 320; let my = H5-90;
  page5.drawRectangle({ x: metricStartX-10, y: my- (16*14) - 14, width: 250, height: (16*14)+24, color: rgb(0.99,1,1) , opacity:1});
  const write = (label:string,val:string)=>{ page5.drawText(label, { x: metricStartX, y: my, size:9, font: fontBold }); page5.drawText(val, { x: metricStartX+140, y: my, size:9, font }); my -= 16; };
  // Derive extra metrics
  // Total roof area ft^2
  let totalFt2 = typeof totals.totalSquares==='number'? totals.totalSquares*100 : undefined;
  if (totalFt2!=null) write('Total roof area', `${totalFt2.toFixed(0)} SqFt.`);
  // pitched vs low pitched reused from earlier computation
  // Recompute for isolation
  let totalPxAll2=0,pitchedPx2=0,lowPx2=0; rotated.forEach((f:any)=>{ const a=polygonArea(f.geometry.coordinates[0]); totalPxAll2+=a; const p=f.properties?.pitch??0; if(p>2) pitchedPx2+=a; else lowPx2+=a; });
  if (totalFt2!=null && totalPxAll2>0){ const pitchedFt=(pitchedPx2/totalPxAll2)*totalFt2; const lowFt=(lowPx2/totalPxAll2)*totalFt2; write('Total pitched area', `${pitchedFt.toFixed(0)} SqFt.`); write('Total flat area', `${lowFt.toFixed(0)} SqFt.`); }
  // Facets (number of polygons)
  write('Total roof facets', `${features.length} facets`);
  // Predominant pitch by area (reuse earlier logic)
  const areaByPitch: Record<string,number> = {}; rotated.forEach((f:any)=>{ const p=f.properties?.pitch??0; const a=polygonArea(f.geometry.coordinates[0]); areaByPitch[p]=(areaByPitch[p]||0)+a; });
  const pred = Object.entries(areaByPitch).sort((a,b)=> b[1]-a[1])[0]; if (pred) write('Predominant pitch', `${pred[0]}/12`);
  // Edge totals (format ft + inches style approximation for example display). We'll render a subset important categories.
  const ftToFtIn = (ft:number)=>{ const totalIn = Math.round(ft*12); const f = Math.floor(totalIn/12); const inch = totalIn%12; return `${f}ft ${inch}in`; };
  const categories: [string,string][] = [ ['eave','Total eaves'], ['valley','Total valleys'], ['hip','Total hips'], ['ridge','Total ridges'], ['rake','Total rakes'] ];
  const edgeTotalsFt: Record<string,number> = totals.edgeTotalsFt || {} as any;
  categories.forEach(([key,label])=> { if (edgeTotalsFt[key]!=null) write(label, ftToFtIn(edgeTotalsFt[key])); });
  // Additional combos
  if (edgeTotalsFt.hip!=null && edgeTotalsFt.ridge!=null) write('Hips + ridges', ftToFtIn(edgeTotalsFt.hip + edgeTotalsFt.ridge));
  if (edgeTotalsFt.eave!=null && edgeTotalsFt.rake!=null) write('Eaves + rakes', ftToFtIn(edgeTotalsFt.eave + edgeTotalsFt.rake));

  // Pitch block (simple) - show predominant pitch area & squares
  const pitchBlockY = sumBox.y - 80;
  page5.drawRectangle({ x:20, y:pitchBlockY, width: 572, height: 60, color: rgb(0.97,0.985,0.995) });
  page5.drawText('Pitch', { x:30, y: pitchBlockY+42, size:10, font: fontBold });
  if (pred) { page5.drawText(`${pred[0]}/12`, { x:70, y: pitchBlockY+42, size:10, font: fontBold }); }
  if (totalFt2!=null) { page5.drawText('Area (SqFt.)', { x:30, y: pitchBlockY+24, size:8, font: fontBold }); page5.drawText(totalFt2.toFixed(0), { x:110, y: pitchBlockY+24, size:8, font }); page5.drawText('Squares', { x:30, y: pitchBlockY+10, size:8, font: fontBold }); page5.drawText(totals.totalSquares?.toFixed(1)||'', { x:110, y: pitchBlockY+10, size:8, font }); }

  // Waste factor table (simple set of percentages similar to sample). We'll compute wasted area = base * (1 + percent).
  const wastePercents = [0,10,12,15,17,20,22];
  const wasteY = 120; // near bottom
  page5.drawText('Waste %', { x:20, y: wasteY+40, size:10, font: fontBold, color: rgb(0,0.45,0.75) });
  if (totalFt2!=null) {
    // header row
    let x = 120; const cellW = 54;
    // Header cells for waste percentages; left-align percent text to match body cell alignment
    wastePercents.forEach(p=>{
      page5.drawRectangle({ x, y: wasteY+34, width: cellW, height: 18, color: rgb(p===10?0.9:0.965, p===10?0.97:0.99, 1) });
      page5.drawText(p+'%', { x: x+6, y: wasteY+38, size:9, font: fontBold });
      x+=cellW;
    });
    // Area row
  page5.drawText('Area (SqFt.)', { x:20, y: wasteY+18, size:9, font: fontBold });
    x = 120; wastePercents.forEach(p=>{ const area = totalFt2 * (1 + p/100); const txt = area.toFixed(0); page5.drawText(txt, { x: x+4, y: wasteY+18, size:8, font }); x+=cellW; });
    // Squares row
    page5.drawText('Squares', { x:20, y: wasteY+2, size:9, font: fontBold });
    x = 120; wastePercents.forEach(p=>{ const area = totalFt2 * (1 + p/100); const squares = area/100; const txt = squares.toFixed(1); page5.drawText(txt, { x: x+4, y: wasteY+2, size:8, font }); x+=cellW; });
    // Recommended (highlight 10%) label
    page5.drawText('Recommended', { x:120 + cellW*1 + 8, y: wasteY+56, size:9, font: fontBold, color: rgb(0,0.45,0.75) });
  }
  const bytes = await pdf.save();
  // If requested, save to customer files (contact card) and return JSON confirmation
  if (saveToFiles) {
    // Load measurement with relations to find tenant and contact linkage
    const measurement = await prisma.measurement.findUnique({
      where: { id: params.id },
      include: { lead: { include: { contact: true } }, property: { include: { contact: true } } }
    });
    if (!measurement) {
      return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });
    }
    const tenantId = measurement.tenantId;
    const leadId = measurement.leadId || undefined;
    const contactId = measurement.lead?.contactId || measurement.property?.contactId || undefined;
    const customerName = (measurement.lead?.contact?.name || measurement.property?.contact?.name || '').trim() || 'Customer';
    const sanitize = (s: string) => s.replace(/[^\w\-\s\.]/g, '').replace(/\s+/g, ' ').trim();
    const baseTitle = `${sanitize(customerName)}- Measurement`; // per requirement
    const baseNameNoExt = sanitize(baseTitle);
    // Ensure unique filename by appending consecutive numbers if needed
    let attemptName = `${baseNameNoExt}.pdf`;
    let n = 2;
    while (true) {
      const existing = await prisma.file.findFirst({ where: { tenantId, contactId: contactId || undefined, folder: 'measurments', name: attemptName } });
      if (!existing) break;
      attemptName = `${baseNameNoExt} ${n}.pdf`;
      n += 1;
      if (n > 200) break; // safety guard
    }
  const bucket = process.env.GCS_BUCKET;
  const forceLocal = process.env.REPORT_FORCE_LOCAL === '1';
    const publicBase = process.env.GCS_PUBLIC_BASE_URL;
    const hmacAccess = process.env.GCS_HMAC_ACCESS_KEY_ID;
    const hmacSecret = process.env.GCS_HMAC_SECRET_ACCESS_KEY;
    const s3Endpoint = process.env.GCS_S3_ENDPOINT || 'https://storage.googleapis.com';
    const s3Region = process.env.GCS_S3_REGION || 'us-east-1';
    const useS3 = Boolean(bucket && hmacAccess && hmacSecret);
    const s3 = useS3
      ? new S3Client({ region: s3Region, endpoint: s3Endpoint, forcePathStyle: false, credentials: { accessKeyId: hmacAccess!, secretAccessKey: hmacSecret! } })
      : null;
  const filename = attemptName;
    let url: string;
    const buffer = Buffer.from(bytes);
  if (bucket && !forceLocal) {
      try {
        const objectKey = `${tenantId}/${filename}`;
        if (useS3 && s3) {
          try {
            await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: buffer, ContentType: 'application/pdf', ACL: 'public-read' }));
          } catch {
            await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: buffer, ContentType: 'application/pdf' }));
          }
          url = gcsPublicUrl(bucket, objectKey, publicBase);
        } else {
          const storage = getGcs();
          const fileRef = storage.bucket(bucket).file(objectKey);
          await fileRef.save(buffer, { contentType: 'application/pdf', resumable: false });
          try { await fileRef.makePublic(); } catch {}
          url = gcsPublicUrl(bucket, objectKey, publicBase);
        }
      } catch (e) {
        // Fallback to local save if cloud upload fails
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', tenantId);
        await fs.mkdir(uploadDir, { recursive: true });
        const destPath = path.join(uploadDir, filename);
        await fs.writeFile(destPath, buffer as any);
        url = `/uploads/${tenantId}/${filename}`;
      }
  } else {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', tenantId);
      await fs.mkdir(uploadDir, { recursive: true });
      const destPath = path.join(uploadDir, filename);
  await fs.writeFile(destPath, buffer as any);
      url = `/uploads/${tenantId}/${filename}`;
    }
  const fileRec = await prisma.file.create({
      data: {
        tenantId,
        contactId,
        leadId,
        category: 'documents',
    folder: 'measurments',
        name: filename,
        path: url,
        mime: 'application/pdf',
        size: buffer.length
      }
    });
    return NextResponse.json({ ok: true, fileId: fileRec.id, path: fileRec.path }, { status: 201 });
  }
  // Default: return the PDF for download (send raw bytes)
  return new NextResponse(bytes as any, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename=measurement-${params.id}.pdf` }});
  } catch (e:any) {
  try { console.error('Report generation failed', e); } catch {}
  return NextResponse.json({ error: e?.message || 'Failed to generate report' }, { status: 500 });
  }
}
