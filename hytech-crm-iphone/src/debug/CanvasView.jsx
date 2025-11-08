import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DEBUG_UI } from '@/debug/debugFlag';
// Simplified copy of CanvasView (trimmed for scaffold)
export default function CanvasView(){
  if(!DEBUG_UI) return null;
  const canvasRef = useRef(null);
  useEffect(()=>{
    const canvas = canvasRef.current; if(!canvas) return; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#000'; ctx.font='16px sans-serif'; ctx.fillText('CanvasView', 10,24);
  },[]);
  return <canvas ref={canvasRef} width={400} height={180} style={{border:'1px solid #000', display:'block', margin:'12px 0'}} />;
}
