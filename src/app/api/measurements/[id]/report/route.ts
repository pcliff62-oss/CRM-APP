import { NextRequest, NextResponse } from 'next/server';
// @ts-ignore
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
  const { features: rawFeatures = [], totals = {}, imageRotationDeg = 0, accessoryBreakdown = {}, planeSummaries = [], originalImageData, viewBox, canvasSize, saveToFiles = false, accessoryList = [], overlayImageData } = body || {};
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

    // Fetch measurement for gsd and address
  let gsdMPerPx = 0; let addressLine = ''; let addressSnapshot: string | undefined;
    try {
  const measurement = await prisma.measurement.findUnique({
        where: { id: params.id },
        include: { property: true, lead: { include: { property: true } } }
      });
      if (measurement && typeof measurement.gsdMPerPx === 'number') gsdMPerPx = measurement.gsdMPerPx;
  if (measurement && typeof measurement.addressSnapshot === 'string' && measurement.addressSnapshot.trim()) addressSnapshot = measurement.addressSnapshot.trim();
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
    const now = new Date();
    const pad = (n:number)=> String(n).padStart(2,'0');
    const dateStr = `${pad(now.getMonth()+1)}-${pad(now.getDate())}-${now.getFullYear()}`;

    // Layer ordering (raw)
    const layerIds = Array.from(new Set(features.map((f:any)=> (f.properties?.layerId || 'A') as string))).sort((a:string,b:string)=> a.localeCompare(b));
    const layerOrder = new Map<string, number>(); layerIds.forEach((id,idx)=> layerOrder.set(id, idx));
    const orderedRaw = features.map((f:any)=> ({ order: layerOrder.get(f.properties?.layerId||'A')||0, ring: f.geometry.coordinates[0] as number[][], f }));

    // Replicate client canvas transform: translate by viewBox, non-uniform scale to canvas size, then rotate about canvas center.
    const angleDeg = typeof imageRotationDeg === 'number' ? imageRotationDeg : 0;
    const angleRad = angleDeg * Math.PI/180;
    // Robust viewBox fallback: if missing or zero, derive from feature polygon bounds
    let vb = viewBox && viewBox.w>0 && viewBox.h>0 ? viewBox : null;
    if (!vb) {
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      features.forEach((f:any)=>{
        const ring=(f.geometry?.coordinates?.[0]||[]) as number[][]; ring.forEach(([x,y])=>{ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; });
      });
      if(Number.isFinite(minX)&&Number.isFinite(minY)&&Number.isFinite(maxX)&&Number.isFinite(maxY)) {
        vb = { x:minX, y:minY, w:(maxX-minX)||1, h:(maxY-minY)||1 };
      } else {
        vb = { x:0, y:0, w: 1, h: 1 };
      }
    }
    const cs = canvasSize && canvasSize.w>0 && canvasSize.h>0 ? canvasSize : { w: 1000, h: 1000 };
    const cCenterX = cs.w/2, cCenterY = cs.h/2;
    function worldToScreen(pt:number[]): number[] {
      const nx = (pt[0] - vb.x) / (vb.w || 1); // 0..1 within view
      const ny = (pt[1] - vb.y) / (vb.h || 1);
      let sx = nx * cs.w;
      let sy = ny * cs.h;
      // rotate about canvas center
      const dx = sx - cCenterX; const dy = sy - cCenterY;
      const cos = Math.cos(angleRad); const sin = Math.sin(angleRad);
      const rx = dx * cos - dy * sin + cCenterX;
      const ry = dx * sin + dy * cos + cCenterY;
      return [rx, ry];
    }
    const orderedDraw = orderedRaw.map(r=> ({ ...r, screen: r.ring.map(worldToScreen) }));
    // Screen bounds
    let minSX=Infinity,minSY=Infinity,maxSX=-Infinity,maxSY=-Infinity;
    orderedDraw.forEach(r=> r.screen.forEach(p=>{ if(p[0]<minSX)minSX=p[0]; if(p[1]<minSY)minSY=p[1]; if(p[0]>maxSX)maxSX=p[0]; if(p[1]>maxSY)maxSY=p[1]; }));
    if(!Number.isFinite(minSX)){ minSX=0;minSY=0;maxSX=1;maxSY=1; }
    const spanSX = maxSX - minSX || 1; const spanSY = maxSY - minSY || 1;
  try { console.log('[report] viewBox', vb, 'canvasSize', cs, 'angle', angleDeg, 'bounds', { minSX, minSY, maxSX, maxSY, spanSX, spanSY }, 'featureCount', features.length); } catch {}
    const higherRingsFor = (order:number)=> orderedDraw.filter(r=> r.order < order).map(r=> r.screen);

    function pip(x:number, y:number, ring:number[][]){ let inside=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++){ const xi=ring[i][0], yi=ring[i][1]; const xj=ring[j][0], yj=ring[j][1]; const intersect=((yi>y)!==(yj>y)) && (x < ((xj-xi)*(y-yi))/((yj-yi)||1e-9) + xi); if(intersect) inside=!inside; } return inside; }
    function drawSegmentWithOverlap(page:any, a:number[], b:number[], colorRgb:{r:number,g:number,b:number}, thickness:number, tx:(x:number)=>number, ty:(y:number)=>number, higherRings:number[][][]){
      const steps=64; const pts:{x:number;y:number;inside:boolean;t:number}[]=[]; for(let i=0;i<=steps;i++){ const t=i/steps; const x=a[0]*(1-t)+b[0]*t; const y=a[1]*(1-t)+b[1]*t; let inside=false; for(const ring of higherRings){ if(pip(x,y,ring)){ inside=true; break; } } pts.push({x:tx(x),y:ty(y),inside,t}); }
      let i=0; const rgbCol=rgb(colorRgb.r/255,colorRgb.g/255,colorRgb.b/255); while(i<pts.length-1){ const start=i; const inside=pts[i].inside; while(i<pts.length-1 && pts[i+1].inside===inside) i++; const end=i; const p0=pts[start], p1=pts[end]; if(!inside){ page.drawLine({ start:{x:p0.x,y:p0.y}, end:{x:p1.x,y:p1.y}, thickness, color: rgbCol }); } else { const dashCount=Math.max(1,Math.round((end-start)/6)); const seg=(p1.t-p0.t)/(dashCount*2); for(let k=0;k<dashCount;k++){ const tA=p0.t+k*2*seg; const tB=Math.min(p0.t+(k*2+1)*seg,p1.t); const xa=tx(a[0]*(1-tA)+b[0]*tA), ya=ty(a[1]*(1-tA)+b[1]*tA); const xb=tx(a[0]*(1-tB)+b[0]*tB), yb=ty(a[1]*(1-tB)+b[1]*tB); page.drawLine({ start:{x:xa,y:ya}, end:{x:xb,y:yb}, thickness, color: rgbCol }); } } i++; }
    }

    // PAGE 1
    const pagePlan = pdf.addPage([612,792]); const { height: H } = pagePlan.getSize();
  pagePlan.drawText('Roof Measurement', { x:28, y:H-40, size:22, font: fontBold, color: rgb(0,0.45,0.75) });
  pagePlan.drawText(dateStr, { x:28, y:H-56, size:8, font });
  pagePlan.drawText(`Address: ${addressLine || addressSnapshot || params.id}`, { x:28, y:H-68, size:8, font });

    // Edge totals if not provided
    const edgeTotals: Record<string,number> = { ...(totals.edgeTotalsFt || {}) } as any;
    if (!totals.edgeTotalsFt) {
      features.forEach((f:any)=>{
        const ring=f.geometry.coordinates[0]; const edgesArr=(f.properties?.edges||[]) as {i:number;type:string}[];
        for(let i=0;i<ring.length;i++){ const a=ring[i]; const b=ring[(i+1)%ring.length]; const pxLen=Math.hypot(b[0]-a[0], b[1]-a[1]); const ftLen=gsdMPerPx>0? pxLen*gsdMPerPx*M_TO_FT : pxLen; const type=edgesArr.find(e=>e.i===i)?.type || 'unknown'; edgeTotals[type]=(edgeTotals[type]||0)+ftLen; }
      });
    }
    const order = ['eave','rake','ridge','valley','hip','flashing','parapet','transition','unknown'];
    let xCursor=28; let yCursor=H-90; const itemPad=6; const rowHeight=18; const maxRowWidth=612-56; function hexToRgb(hex:string){ const h=hex.replace('#',''); const b=parseInt(h,16); if(h.length===6){ return { r:(b>>16)&255,g:(b>>8)&255,b:b&255 }; } return { r:128,g:128,b:128 }; }
    order.filter(t=> edgeTotals[t]>0).forEach(type=>{ const colorHex=EDGE_COLORS[type]||'#999'; const label=`${type}: ${edgeTotals[type].toFixed(1)} ft`; const tw=font.widthOfTextAtSize(label,9); const boxW=tw+itemPad*2; if (xCursor+boxW>maxRowWidth){ xCursor=28; yCursor-=rowHeight; } pagePlan.drawRectangle({ x:xCursor,y:yCursor-4,width:boxW,height:rowHeight-4,color:rgb(0.97,0.98,0.99), borderColor:rgb(0.85,0.9,0.95), borderWidth:1 }); const col=hexToRgb(colorHex); pagePlan.drawText(label,{ x:xCursor+itemPad,y:yCursor+2,size:9,font:fontBold,color:rgb(col.r/255,col.g/255,col.b/255) }); xCursor+=boxW+8; });
  let metricsY=yCursor-24; if(typeof totals.totalSquares==='number'){ pagePlan.drawText(`Total Squares: ${totals.totalSquares.toFixed(2)}`,{ x:28,y:metricsY,size:10,font:fontBold }); metricsY-=14; } if(typeof totals.totalPerimeterFt==='number'){ pagePlan.drawText(`Perimeter: ${totals.totalPerimeterFt.toFixed(1)} ft`,{ x:28,y:metricsY,size:10,font:fontBold }); metricsY-=14; }
  // Predominant pitch
  try { const areaEntries: {pitch:number;area:number}[] = features.map((f:any)=>({ pitch:f.properties?.pitch??0, area:polygonArea(f.geometry.coordinates[0]) })); const areaByPitch: Record<string,number>={}; areaEntries.forEach(e=>{ areaByPitch[e.pitch]=(areaByPitch[e.pitch]||0)+e.area; }); const predominant=Object.entries(areaByPitch).sort((a,b)=> b[1]-a[1])[0]; if(predominant){ pagePlan.drawText(`Predominant Pitch: ${predominant[0]}/12`, { x:28, y:metricsY, size:10, font:fontBold }); metricsY-=14; } } catch {}

  const drawBox={ x:40,y:80,w:532,h:metricsY-100 }; if(drawBox.h<320) drawBox.h=320; pagePlan.drawRectangle({ x:drawBox.x,y:drawBox.y,width:drawBox.w,height:drawBox.h,borderColor:rgb(0.85,0.9,0.95),borderWidth:1 });

  // Aspect-preserving mapping: uniform scale + center to avoid skew vs original canvas
  const scalePlan=Math.min(drawBox.w/(cs.w||1), drawBox.h/(cs.h||1));
  const offsetXPlan=drawBox.x + (drawBox.w - (cs.w*scalePlan)) / 2;
  const offsetYPlan=drawBox.y + (drawBox.h - (cs.h*scalePlan)) / 2;
  const txPlan=(sx:number)=> offsetXPlan + sx*scalePlan;
  const tyPlan=(sy:number)=> offsetYPlan + (cs.h - sy)*scalePlan; // keep vertical orientation
    if (overlayImageData && typeof overlayImageData === 'string') {
      try {
        const imgBase64=overlayImageData.split(',')[1]||overlayImageData;
        const imgBytes=Uint8Array.from(Buffer.from(imgBase64,'base64'));
        let img; if(/png/i.test(overlayImageData)) img=await pdf.embedPng(imgBytes); else img=await pdf.embedJpg(imgBytes);
        const iw=img.width, ih=img.height; const sc=Math.min(drawBox.w/iw, drawBox.h/ih); const dw=iw*sc, dh=ih*sc;
        const ox=drawBox.x + (drawBox.w - dw)/2; const oy=drawBox.y + (drawBox.h - dh)/2;
        pagePlan.drawImage(img,{ x:ox, y:oy, width:dw, height:dh });
      } catch {}
    } else {
      orderedDraw.forEach(({ f, ring, screen }:any)=>{
      const edgesArr=(f.properties?.edges||[]) as {i:number;type:string}[];
      for(let i=0;i<screen.length;i++){
        const a=screen[i]; const b=screen[(i+1)%screen.length];
        const type=edgesArr.find(e=> e.i===i)?.type || 'unknown';
        const colorHex=EDGE_COLORS[type]||'#666'; const col=hexToRgb(colorHex);
        pagePlan.drawLine({ start:{ x: txPlan(a[0]), y: tyPlan(a[1]) }, end:{ x: txPlan(b[0]), y: tyPlan(b[1]) }, thickness:1.4, color: rgb(col.r/255,col.g/255,col.b/255) });
        // Edge length label
        const midx=(a[0]+b[0])/2; const midy=(a[1]+b[1])/2;
        const pxLen=Math.hypot(ring[(i+1)%ring.length][0]-ring[i][0], ring[(i+1)%ring.length][1]-ring[i][1]);
        let label:string; if(gsdMPerPx>0){ let ft=pxLen*gsdMPerPx*M_TO_FT; if(type==='rake'||type==='valley'||type==='hip'){ const pitch=typeof f.properties?.pitch==='number'? f.properties.pitch:0; const mult=1/Math.cos((pitch/12)||0); if(Number.isFinite(mult)&&mult>0) ft*=mult; } label=ft<10? ft.toFixed(2)+' ft': ft.toFixed(1)+' ft'; } else { label=pxLen.toFixed(0)+' px'; }
  const dx=b[0]-a[0]; const dy=b[1]-a[1]; const len=Math.hypot(dx,dy)||1; const ux=-dy/len; const uy=dx/len; const offset=6; const scaleForLabel=scalePlan; const lx=txPlan(midx)+ux*offset*scaleForLabel*0.4; const ly=tyPlan(midy)+uy*offset*scaleForLabel*0.4; const tw=font.widthOfTextAtSize(label,7);
        pagePlan.drawRectangle({ x:lx - tw/2 - 2, y: ly - 4, width: tw + 4, height: 10, color: rgb(1,1,1), opacity:0.85 });
        pagePlan.drawText(label,{ x: lx - tw/2, y: ly - 2, size:7, font: fontBold, color: rgb(col.r/255,col.g/255,col.b/255) });
        }
      });
    }
  if(originalImageData && typeof originalImageData==='string'){ try { const imgBase64=originalImageData.split(',')[1]||originalImageData; const imgBytes=Uint8Array.from(Buffer.from(imgBase64,'base64')); let img; if(/png/i.test(originalImageData)) img=await pdf.embedPng(imgBytes); else img=await pdf.embedJpg(imgBytes); const iw=img.width, ih=img.height; const maxW=140,maxH=110; const sc=Math.min(maxW/iw,maxH/ih); const dw=iw*sc, dh=ih*sc; pagePlan.drawImage(img,{ x:drawBox.x+drawBox.w-dw-8, y:drawBox.y+8, width:dw, height:dh, rotate:{ type:'degrees', angle:imageRotationDeg||0 } as any }); pagePlan.drawText('Original',{ x:drawBox.x+drawBox.w-dw-4, y:drawBox.y+8+dh+2, size:8, font }); } catch {} }

  // PAGE 2 Areas
    const page2=pdf.addPage([612,792]); page2.drawText('Roof Areas',{ x:28,y:H-50,size:20,font:fontBold,color:rgb(0,0.45,0.75) });
    let totalPxAll=0,pitchedPx=0,lowPx=0; features.forEach((f:any)=>{ const a=polygonArea(f.geometry.coordinates[0]); totalPxAll+=a; const p=f.properties?.pitch??0; if(p>2) pitchedPx+=a; else lowPx+=a; });
    let pitchedFt2: number|null=null, lowFt2: number|null=null; if(typeof totals.totalSquares==='number' && totalPxAll>0){ const totalFt2=totals.totalSquares*100; pitchedFt2=(pitchedPx/totalPxAll)*totalFt2; lowFt2=(lowPx/totalPxAll)*totalFt2; }
    let areaMetricsY=H-70-16; if(pitchedFt2!=null){ page2.drawText(`Total Pitched Roof Area (>2/12): ${pitchedFt2.toFixed(0)} SqFt.`,{ x:28,y:areaMetricsY,size:10,font:fontBold }); areaMetricsY-=14; page2.drawText(`Total Low Pitched Roof Area (<=2/12): ${lowFt2!.toFixed(0)} SqFt.`,{ x:28,y:areaMetricsY,size:10,font:fontBold }); areaMetricsY-=18; } else { page2.drawText(`Total Pitched Roof Area (>2/12): ${pitchedPx.toFixed(0)} px^2`,{ x:28,y:areaMetricsY,size:10,font:fontBold }); areaMetricsY-=14; page2.drawText(`Total Low Pitched Roof Area (<=2/12): ${lowPx.toFixed(0)} px^2`,{ x:28,y:areaMetricsY,size:10,font:fontBold }); areaMetricsY-=18; }
    const areaBoxTop=areaMetricsY; const areaBox={ x:40,y:80,w:532,h: areaBoxTop - 90 }; if(areaBox.h<420) areaBox.h=420; page2.drawRectangle({ x:areaBox.x,y:areaBox.y,width:areaBox.w,height:areaBox.h,borderColor:rgb(0.85,0.9,0.95),borderWidth:1 });
  const scaleArea=Math.min(areaBox.w/(cs.w||1), areaBox.h/(cs.h||1)); const offsetXArea=areaBox.x + (areaBox.w - cs.w*scaleArea)/2; const offsetYArea=areaBox.y + (areaBox.h - cs.h*scaleArea)/2; const tx2=(sx:number)=> offsetXArea + sx*scaleArea; const ty2=(sy:number)=> offsetYArea + (cs.h - sy)*scaleArea;
  orderedDraw.forEach(({ f, ring, screen }:any)=>{ for(let i=0;i<screen.length;i++){ const a=screen[i]; const b=screen[(i+1)%screen.length]; page2.drawLine({ start:{ x: tx2(a[0]), y: ty2(a[1]) }, end:{ x: tx2(b[0]), y: ty2(b[1]) }, thickness:1, color: rgb(38/255,140/255,204/255) }); } const areaPx=polygonArea(ring); let areaFt2: number|null=null; if(typeof totals.totalSquares==='number' && totals.totalSquares>0){ const weights=features.map((rf:any)=>{ const apx=polygonArea(rf.geometry.coordinates[0]); const pitch=typeof rf.properties?.pitch==='number'? rf.properties.pitch:0; const mult=1/Math.cos((pitch/12)||0); return apx*(Number.isFinite(mult)&&mult>0? mult:1); }); const totalW=weights.reduce((s:number,v:number)=> s+v,0); if(totalW>0){ const pitch=typeof f.properties?.pitch==='number'? f.properties.pitch:0; const mult=1/Math.cos((pitch/12)||0)||1; const w=areaPx*(Number.isFinite(mult)&&mult>0? mult:1); areaFt2=(w/totalW)*(totals.totalSquares*100); } } const cxR=screen.reduce((s:number,p:number[])=> s+p[0],0)/screen.length; const cyR=screen.reduce((s:number,p:number[])=> s+p[1],0)/screen.length; const lx=tx2(cxR); const ly=ty2(cyR); const label=areaFt2!=null? `${areaFt2.toFixed(0)} SqFt.` : `${areaPx.toFixed(0)} px^2`; page2.drawText(label,{ x: lx - (label.length*3), y: ly - 4, size:10, font: fontBold, color: rgb(0.05,0.2,0.35) }); });

  // PAGE 3 Pitches
  // PAGE 3 Pitches
  const page3=pdf.addPage([612,792]); page3.drawText('Pitches',{ x:28,y:H-50,size:20,font:fontBold,color:rgb(0,0.45,0.75) }); const pitchBox={ x:40,y:80,w:532,h:620 }; page3.drawRectangle({ x:pitchBox.x,y:pitchBox.y,width:pitchBox.w,height:pitchBox.h,borderColor:rgb(0.85,0.9,0.95),borderWidth:1 }); const scalePitch=Math.min(pitchBox.w/(cs.w||1), pitchBox.h/(cs.h||1)); const offsetXPitch=pitchBox.x + (pitchBox.w - cs.w*scalePitch)/2; const offsetYPitch=pitchBox.y + (pitchBox.h - cs.h*scalePitch)/2; const tx3=(sx:number)=> offsetXPitch + sx*scalePitch; const ty3=(sy:number)=> offsetYPitch + (cs.h - sy)*scalePitch; orderedDraw.forEach(({ f, screen }:any)=>{ for(let i=0;i<screen.length;i++){ const a=screen[i]; const b=screen[(i+1)%screen.length]; page3.drawLine({ start:{ x: tx3(a[0]), y: ty3(a[1]) }, end:{ x: tx3(b[0]), y: ty3(b[1]) }, thickness:1, color: rgb(38/255,140/255,204/255) }); } const cxR=screen.reduce((s:number,p:number[])=> s+p[0],0)/screen.length; const cyR=screen.reduce((s:number,p:number[])=> s+p[1],0)/screen.length; const pitch=f.properties?.pitch ?? 0; const lx=tx3(cxR); const ly=ty3(cyR); const label=pitch ? `${pitch}/12`:'flat'; page3.drawText(label,{ x: lx - (label.length*3), y: ly - 4, size:10, font: fontBold, color: rgb(0.05,0.2,0.35) }); });

  // PAGE 4 Accessories (conditional)
  // PAGE 4 Accessories (conditional)
  // Accessories page: derive breakdown if missing and accessories exist
  const accessoryBreakdownActual = (accessoryBreakdown && Object.keys(accessoryBreakdown).length>0)
    ? accessoryBreakdown
    : (() => {
        const out: Record<string, Record<string, number>> = {}
        const list: any[] = Array.isArray(accessoryList) ? accessoryList : []
        list.forEach(a => {
          if(!a) return; const type=(a.type||'other').toString(); const variant=(a.data?.size || a.data?.ventType || a.data?.flangeSize || a.data?.note || 'generic').toString(); out[type] = out[type] || {}; out[type][variant] = (out[type][variant] || 0) + 1; });
        return out
      })();
  if(accessoryBreakdownActual && Object.keys(accessoryBreakdownActual).length>0){ const page4=pdf.addPage([612,792]); const H4=792; page4.drawText('Accessories',{ x:28,y:H4-50,size:20,font:fontBold,color:rgb(0,0.45,0.75) }); const accBox={ x:40,y:390,w:532,h:300 }; page4.drawRectangle({ x:accBox.x,y:accBox.y,width:accBox.w,height:accBox.h,borderColor:rgb(0.85,0.9,0.95),borderWidth:1 }); const scaleAcc=Math.min(accBox.w/(cs.w||1), accBox.h/(cs.h||1)); const offsetXAcc=accBox.x + (accBox.w - cs.w*scaleAcc)/2; const offsetYAcc=accBox.y + (accBox.h - cs.h*scaleAcc)/2; const txAcc=(sx:number)=> offsetXAcc + sx*scaleAcc; const tyAcc=(sy:number)=> offsetYAcc + (cs.h - sy)*scaleAcc; orderedDraw.forEach(({ screen }:any)=>{ for(let i=0;i<screen.length;i++){ const a=screen[i]; const b=screen[(i+1)%screen.length]; page4.drawLine({ start:{ x: txAcc(a[0]), y: tyAcc(a[1]) }, end:{ x: txAcc(b[0]), y: tyAcc(b[1]) }, thickness:1, color: rgb(51/255,51/255,51/255) }); } }); features.forEach((f:any)=>{ const accs:any[]=f.properties?.accessories||[]; accs.forEach(acc=>{ const ptScreen=worldToScreen([acc.x,acc.y]); const x=txAcc(ptScreen[0]); const y=tyAcc(ptScreen[1]); page4.drawCircle({ x,y,size:4,color:rgb(0.95,0.95,0.95), borderColor:rgb(0.1,0.5,0.7), borderWidth:1 }); let lbl=''; if(acc.type==='Skylight'||acc.type==='skylight'){ lbl=(acc.data?.size? String(acc.data.size).toUpperCase():'')||'Skylight'; } else if(/vent/i.test(acc.type)){ lbl=(acc.data?.ventType||'Vent').toString(); } else if(/pipe/i.test(acc.type)){ lbl=(acc.data?.flangeSize||acc.data?.size||'Pipe').toString(); } else if(/other/i.test(acc.type)){ lbl=(acc.data?.note||'Other').toString(); } else { lbl=acc.type||''; } page4.drawText(lbl,{ x:x+6,y:y-3,size:8,font:fontBold,color:rgb(0.1,0.4,0.55) }); }); }); let tableY=340; page4.drawText('Breakdown',{ x:40,y:tableY,size:12,font:fontBold,color:rgb(0.1,0.4,0.55) }); tableY-=16; const colXType=40,colXVariant=210,colXCount=470; const headerColor=rgb(0.9,0.94,0.97); page4.drawRectangle({ x:colXType-4,y:tableY-4,width:colXCount-colXType+100,height:20,color:headerColor }); page4.drawText('Type',{ x:colXType,y:tableY+2,size:9,font:fontBold }); page4.drawText('Variant',{ x:colXVariant,y:tableY+2,size:9,font:fontBold }); page4.drawText('Count',{ x:colXCount,y:tableY+2,size:9,font:fontBold }); tableY-=24; const sortedTypes=Object.keys(accessoryBreakdownActual).sort((a,b)=> a.localeCompare(b)); sortedTypes.forEach(type=>{ const variants=Object.entries(accessoryBreakdownActual[type as any] as Record<string,number>).sort((a,b)=> a[0].localeCompare(b[0])); variants.forEach(([variant,count],idx)=>{ const rowH=16; const bg=idx%2===0? rgb(1,1,1): rgb(0.98,0.985,0.99); page4.drawRectangle({ x:colXType-4,y:tableY-2,width:colXCount-colXType+100,height:rowH,color:bg }); page4.drawText(type,{ x:colXType,y:tableY+2,size:8,font }); page4.drawText(variant,{ x:colXVariant,y:tableY+2,size:8,font }); page4.drawText(String(count),{ x:colXCount,y:tableY+2,size:8,font }); tableY-=rowH; }); tableY-=4; }); }

  // PAGE 5 Summary
  const page5=pdf.addPage([612,792]); const { height: H5 }=page5.getSize(); page5.drawText('Report summary',{ x:20,y:H5-50,size:18,font:fontBold,color:rgb(0,0.45,0.75) }); page5.drawText(`Address: ${addressLine || addressSnapshot || params.id}`,{ x:20,y:H5-66,size:9,font });
  // Mini plan thumbnail (sumBox) restored
  const sumBox={ x:30,y:H5-430,w:260,h:250 }; page5.drawRectangle({ x:sumBox.x,y:sumBox.y,width:sumBox.w,height:sumBox.h,borderColor:rgb(0.85,0.9,0.95),borderWidth:1 });
  // Title above roof planes box
  page5.drawText('Roof Planes',{ x:sumBox.x, y: sumBox.y + sumBox.h + 10, size:12, font: fontBold, color: rgb(0,0.45,0.75) });
  const scaleSum=Math.min(sumBox.w/(cs.w||1), sumBox.h/(cs.h||1)); const offsetXSum=sumBox.x + (sumBox.w - cs.w*scaleSum)/2; const offsetYSum=sumBox.y + (sumBox.h - cs.h*scaleSum)/2; const txSum=(sx:number)=> offsetXSum + sx*scaleSum; const tySum=(sy:number)=> offsetYSum + (cs.h - sy)*scaleSum; if (overlayImageData && typeof overlayImageData === 'string') { try { const imgBase64=overlayImageData.split(',')[1]||overlayImageData; const imgBytes=Uint8Array.from(Buffer.from(imgBase64,'base64')); let img; if(/png/i.test(overlayImageData)) img=await pdf.embedPng(imgBytes); else img=await pdf.embedJpg(imgBytes); const iw=img.width, ih=img.height; const sc=Math.min(sumBox.w/iw, sumBox.h/ih); const dw=iw*sc, dh=ih*sc; const ox=sumBox.x + (sumBox.w - dw)/2; const oy=sumBox.y + (sumBox.h - dh)/2; page5.drawImage(img,{ x:ox, y:oy, width:dw, height:dh }); } catch {} } else { orderedDraw.forEach(({ screen, f }:any, idx:number)=>{ for(let i=0;i<screen.length;i++){ const a=screen[i]; const b=screen[(i+1)%screen.length]; page5.drawLine({ start:{ x: txSum(a[0]), y: tySum(a[1]) }, end:{ x: txSum(b[0]), y: tySum(b[1]) }, thickness:1, color: rgb(26/255,119/255,158/255) }); } // centroid label letter
    if(screen.length>2){ const cx=screen.reduce((s:number,p:number[])=> s+p[0],0)/screen.length; const cy=screen.reduce((s:number,p:number[])=> s+p[1],0)/screen.length; const letter=(()=>{ let n=idx; let s=''; n++; while(n>0){ const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); } return s; })(); page5.drawText(letter,{ x: txSum(cx)-4, y: tySum(cy)-5, size:11, font: fontBold, color: rgb(0.1,0.35,0.55) }); }
  }); }
  // Overlay accessory locations on roof planes mini map
  try {
    features.forEach((f:any)=>{
      const accs:any[] = f.properties?.accessories || [];
      accs.forEach(acc=>{
        if(acc==null || typeof acc.x!=='number' || typeof acc.y!=='number') return;
        const ptScreen=worldToScreen([acc.x,acc.y]);
        const ax=txSum(ptScreen[0]); const ay=tySum(ptScreen[1]);
        // Draw dot
        page5.drawCircle({ x:ax, y:ay, size:4, color:rgb(0.95,0.95,0.95), borderColor:rgb(0.1,0.5,0.7), borderWidth:1 });
        // Determine type letter
        const t=(acc.type||'').toLowerCase();
        let code='';
        if(t.startsWith('skylight')) code='S'; else if(t.startsWith('vent')) code='V'; else if(t.startsWith('pipe')) code='P'; else if(t.startsWith('other')) code='O'; else code=(t[0]||'').toUpperCase();
        // Variant text (selected details)
        let variant='';
        if(acc.type==='Skylight'){ variant=(acc.data?.size||'').toString().toUpperCase(); }
        else if(acc.type==='Vents'){ const opts=Array.isArray(acc.data?.options)? acc.data.options:[]; variant=(acc.data?.ventType || (opts[0]||'')); }
        else if(acc.type==='Pipe flange'){ variant=(acc.data?.size||acc.data?.flangeSize||'').toString(); }
        else if(acc.type==='Other'){ variant=(acc.data?.note||'').toString(); }
        else { variant=(acc.data?.size || acc.data?.ventType || acc.data?.flangeSize || acc.data?.note || '').toString(); }
        // Draw letter and variant
        page5.drawText(code,{ x:ax-2, y:ay-3, size:7, font: fontBold, color: rgb(0.1,0.35,0.55) });
        if(variant){ page5.drawText(String(variant).toUpperCase(),{ x:ax+6, y:ay-3, size:7, font, color: rgb(0.1,0.35,0.55) }); }
      });
    });
  } catch {}

  // Summary metrics block (restored)
  const metricStartX=320; let my=H5-90;
  page5.drawRectangle({ x:metricStartX-10,y: my-(16*14)-14,width:250,height:(16*14)+24,color:rgb(0.99,1,1),opacity:1 });
  const write=(label:string,val:string)=>{ page5.drawText(label,{ x:metricStartX,y:my,size:9,font:fontBold }); page5.drawText(val,{ x:metricStartX+140,y:my,size:9,font }); my-=16; };
  let totalFt2=typeof totals.totalSquares==='number'? totals.totalSquares*100: undefined; if(totalFt2!=null) write('Total roof area', `${totalFt2.toFixed(0)} SqFt.`);
  let totalPxAll2=0,pitchedPx2=0,lowPx2=0; features.forEach((f:any)=>{ const a=polygonArea(f.geometry.coordinates[0]); totalPxAll2+=a; const p=f.properties?.pitch??0; if(p>2) pitchedPx2+=a; else lowPx2+=a; });
  if(totalFt2!=null && totalPxAll2>0){ const pitchedFt=(pitchedPx2/totalPxAll2)*totalFt2; const lowFt=(lowPx2/totalPxAll2)*totalFt2; write('Total pitched area', `${pitchedFt.toFixed(0)} SqFt.`); write('Total flat area', `${lowFt.toFixed(0)} SqFt.`); }
  write('Total roof facets', `${features.length} facets`);
  const areaByPitch: Record<string,number>={}; features.forEach((f:any)=>{ const p=f.properties?.pitch??0; const a=polygonArea(f.geometry.coordinates[0]); areaByPitch[p]=(areaByPitch[p]||0)+a; }); const pred=Object.entries(areaByPitch).sort((a,b)=> b[1]-a[1])[0]; if(pred) write('Predominant pitch', `${pred[0]}/12`);
  const ftToFtIn=(ft:number)=>{ const totalIn=Math.round(ft*12); const f=Math.floor(totalIn/12); const inch=totalIn%12; return `${f}ft ${inch}in`; };
  const categories:[string,string][]= [ ['eave','Total eaves'], ['valley','Total valleys'], ['hip','Total hips'], ['ridge','Total ridges'], ['rake','Total rakes'] ]; const edgeTotalsFt: Record<string,number>=totals.edgeTotalsFt || {} as any; categories.forEach(([key,label])=>{ if(edgeTotalsFt[key]!=null) write(label, ftToFtIn(edgeTotalsFt[key])); }); if(edgeTotalsFt.hip!=null && edgeTotalsFt.ridge!=null) write('Hips + ridges', ftToFtIn(edgeTotalsFt.hip + edgeTotalsFt.ridge)); if(edgeTotalsFt.eave!=null && edgeTotalsFt.rake!=null) write('Eaves + rakes', ftToFtIn(edgeTotalsFt.eave + edgeTotalsFt.rake));
  // Pitch block (restored)
  const pitchBlockY=sumBox.y - 80; page5.drawRectangle({ x:20,y:pitchBlockY,width:572,height:60,color:rgb(0.97,0.985,0.995) }); page5.drawText('Pitch',{ x:30,y:pitchBlockY+42,size:10,font:fontBold }); if(pred){ page5.drawText(`${pred[0]}/12`,{ x:70,y:pitchBlockY+42,size:10,font:fontBold }); } if(totalFt2!=null){ page5.drawText('Area (SqFt.)',{ x:30,y:pitchBlockY+24,size:8,font:fontBold }); page5.drawText(totalFt2.toFixed(0),{ x:110,y:pitchBlockY+24,size:8,font }); page5.drawText('Squares',{ x:30,y:pitchBlockY+10,size:8,font:fontBold }); page5.drawText(totals.totalSquares?.toFixed(1)||'',{ x:110,y:pitchBlockY+10,size:8,font }); }
  // Waste table (restored)
  const wastePercents=[0,10,12,15,17,20,22]; const wasteY=120; page5.drawText('Waste %',{ x:20,y:wasteY+40,size:10,font:fontBold,color:rgb(0,0.45,0.75) }); if(totalFt2!=null){ let x=120; const cellW=54; wastePercents.forEach(p=>{ page5.drawRectangle({ x,y:wasteY+34,width:cellW,height:18,color:rgb(p===10?0.9:0.965,p===10?0.97:0.99,1) }); page5.drawText(p+'%',{ x:x+6,y:wasteY+38,size:9,font:fontBold }); x+=cellW; }); page5.drawText('Area (SqFt.)',{ x:20,y:wasteY+18,size:9,font:fontBold }); x=120; wastePercents.forEach(p=>{ const area=totalFt2*(1+p/100); page5.drawText(area.toFixed(0),{ x:x+4,y:wasteY+18,size:8,font }); x+=cellW; }); page5.drawText('Squares',{ x:20,y:wasteY+2,size:9,font:fontBold }); x=120; wastePercents.forEach(p=>{ const area=totalFt2*(1+p/100); const sq=area/100; page5.drawText(sq.toFixed(1),{ x:x+4,y:wasteY+2,size:8,font }); x+=cellW; }); page5.drawText('Recommended',{ x:120 + cellW*1 + 8, y:wasteY+56,size:9,font:fontBold,color:rgb(0,0.45,0.75) }); }
  // Accessories list under summary metrics (restored)
  try {
    const accList: any[] = Array.isArray(body.accessoryList) ? body.accessoryList : [];
    if (accList.length) {
      page5.drawText('Accessories',{ x:metricStartX,y:my-4,size:10,font:fontBold,color:rgb(0,0.45,0.75) });
      my -= 18;
      const accSorted = accList.slice().sort((a,b)=> a.type.localeCompare(b.type) || (a.planeId||'').localeCompare(b.planeId||''));
      accSorted.forEach(a => {
        const typeCap = a.type ? a.type[0].toUpperCase() + a.type.slice(1) : 'Accessory';
        const variant = a.data?.size || a.data?.ventType || a.data?.flangeSize || a.data?.note || '';
        const leftLabel = variant ? `${typeCap} (${variant})` : typeCap;
        const plane = (()=>{ let n=a.polyIndex??0; let s=''; n++; while(n>0){ const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); } return s; })();
        page5.drawText(leftLabel,{ x:metricStartX,y:my,size:8,font });
        page5.drawText(`Roof Plane: ${plane}`,{ x:metricStartX+140,y:my,size:8,font });
        my -= 12;
      });
    }
  } catch {}

  const bytes=await pdf.save();

    if(saveToFiles){
  const measurement=await prisma.measurement.findUnique({ where:{ id: params.id }, include:{ lead:{ include:{ contact:true } }, property:{ include:{ contact:true } } } });
      if(!measurement){ return NextResponse.json({ error:'Measurement not found' },{ status:404 }); }
      const tenantId=measurement.tenantId; const leadId=measurement.leadId || undefined; const contactId=measurement.lead?.contactId || measurement.property?.contactId || undefined; const customerName=(measurement.lead?.contact?.name || measurement.property?.contact?.name || '').trim() || 'Customer';
      const sanitize=(s:string)=> s.replace(/[^\w\-\s\.]/g,'').replace(/\s+/g,' ').trim();
      const baseTitle=`${sanitize(customerName)}- Measurement`; const baseNameNoExt=sanitize(baseTitle);
      let attemptName=`${baseNameNoExt}.pdf`; let n=2; while(true){ const existing=await prisma.file.findFirst({ where:{ tenantId, contactId: contactId || undefined, folder:'documents', name:attemptName } }); if(!existing) break; attemptName=`${baseNameNoExt} ${n}.pdf`; n++; if(n>200) break; }
      const bucket=process.env.GCS_BUCKET; const forceLocal=process.env.REPORT_FORCE_LOCAL==='1'; const publicBase=process.env.GCS_PUBLIC_BASE_URL; const hmacAccess=process.env.GCS_HMAC_ACCESS_KEY_ID; const hmacSecret=process.env.GCS_HMAC_SECRET_ACCESS_KEY; const s3Endpoint=process.env.GCS_S3_ENDPOINT || 'https://storage.googleapis.com'; const s3Region=process.env.GCS_S3_REGION || 'us-east-1'; const useS3=Boolean(bucket && hmacAccess && hmacSecret); const s3= useS3 ? new S3Client({ region:s3Region, endpoint:s3Endpoint, forcePathStyle:false, credentials:{ accessKeyId:hmacAccess!, secretAccessKey:hmacSecret! } }) : null;
      const filename=attemptName; let url:string; const buffer=Buffer.from(bytes);
      if(bucket && !forceLocal){ try { const objectKey=`${tenantId}/${filename}`; if(useS3 && s3){ try { await s3.send(new PutObjectCommand({ Bucket:bucket, Key:objectKey, Body:buffer, ContentType:'application/pdf', ACL:'public-read' })); } catch { await s3.send(new PutObjectCommand({ Bucket:bucket, Key:objectKey, Body:buffer, ContentType:'application/pdf' })); } url=gcsPublicUrl(bucket, objectKey, publicBase); } else { const storage=getGcs(); const fileRef=storage.bucket(bucket).file(objectKey); await fileRef.save(buffer,{ contentType:'application/pdf', resumable:false }); try { await fileRef.makePublic(); } catch {} url=gcsPublicUrl(bucket, objectKey, publicBase); } } catch(e){ const uploadDir=path.join(process.cwd(),'public','uploads',tenantId); await fs.mkdir(uploadDir,{ recursive:true }); const destPath=path.join(uploadDir,filename); await fs.writeFile(destPath, buffer as any); url=`/uploads/${tenantId}/${filename}`; } } else { const uploadDir=path.join(process.cwd(),'public','uploads',tenantId); await fs.mkdir(uploadDir,{ recursive:true }); const destPath=path.join(uploadDir,filename); await fs.writeFile(destPath, buffer as any); url=`/uploads/${tenantId}/${filename}`; }
      const fileRec=await prisma.file.create({ data:{ tenantId, contactId, leadId, category:'documents', folder:'documents', name:filename, path:url, mime:'application/pdf', size:buffer.length } });
      return NextResponse.json({ ok:true, fileId:fileRec.id, path:fileRec.path },{ status:201 });
    }

    return new NextResponse(bytes as any,{ status:200, headers:{ 'Content-Type':'application/pdf', 'Content-Disposition':`attachment; filename=measurement-${params.id}.pdf` }});
  } catch(e:any){
    try { console.error('Report generation failed', e); } catch {}
    return NextResponse.json({ error: e?.message || 'Failed to generate report' },{ status:500 });
  }
}
