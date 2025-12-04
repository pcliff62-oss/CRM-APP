import React, { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Annotator
 * A lightweight canvas-based photo markup tool.
 *
 * Props:
 * - src?: string | undefined — optional image URL to preload
 * - onExport?: (dataUrl: string) => void — called when exporting image
 * - onChange?: (state: { annotations: any[] }) => void — called on state changes
 * - width?: number — canvas width
 * - height?: number — canvas height
 */
export default function Annotator({
  src,
  onExport,
  onChange,
  width = 800,
  height = 600,
}) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const imgRef = useRef(null);
  const [image, setImage] = useState(null);
  const [view, setView] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const pinchRef = useRef({ active: false, startScale: 1, startOffset: { x: 0, y: 0 }, center: { x: 0, y: 0 } });
  const [tool, setTool] = useState('pen'); // pen | arrow | rect | text
  const [color, setColor] = useState('#ff0000');
  const [size, setSize] = useState(3);
  const [textValue, setTextValue] = useState('');
  const [activeTextBox, setActiveTextBox] = useState(null); // {startClient:{x,y}, endClient:{x,y}} while dragging
  const [textEditor, setTextEditor] = useState(null); // {x,y,w,h, value}
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [startClientPos, setStartClientPos] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Load initial image from src
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setImage(img);
      redraw();
    };
    img.onerror = () => {
      console.warn('Failed to load image for Annotator:', src);
    };
    img.src = src;
  }, [src]);

  const getCtx = () => canvasRef.current?.getContext('2d');

  const clearCanvas = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }, []);

  const drawImage = useCallback(() => {
    if (!image) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { width: cw, height: ch } = ctx.canvas;
    // Fit image to canvas while preserving aspect ratio
    const ratio = Math.min(cw / image.width, ch / image.height);
    const w = image.width * ratio;
    const h = image.height * ratio;
    const x = (cw - w) / 2;
    const y = (ch - h) / 2;
    ctx.drawImage(image, x, y, w, h);
  }, [image]);

  const drawAnnotations = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    annotations.forEach((a) => {
      ctx.save();
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineWidth = a.size;
      if (a.type === 'pen') {
        ctx.beginPath();
        a.points.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      } else if (a.type === 'rect') {
        const w = a.end.x - a.start.x;
        const h = a.end.y - a.start.y;
        ctx.strokeRect(a.start.x, a.start.y, w, h);
      } else if (a.type === 'arrow') {
        drawArrow(ctx, a.start, a.end);
      } else if (a.type === 'text') {
        ctx.font = `${Math.max(12, a.size * 5)}px sans-serif`;
        const lh = Math.max(14, a.size * 6);
        if (a.box) {
          drawMultilineText(ctx, a.text || '', a.pos.x, a.pos.y, a.box.w, lh);
        } else {
          ctx.fillText(a.text || '', a.pos.x, a.pos.y);
        }
      }
      ctx.restore();
    });
  }, [annotations]);

  const redraw = useCallback(() => {
    clearCanvas();
    drawImage();
    drawAnnotations();
  }, [clearCanvas, drawImage, drawAnnotations]);

  useEffect(() => {
    redraw();
  }, [image, annotations, redraw]);

  const pointerToCanvas = (evt) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    // Map client (CSS pixel) coords to canvas internal pixel coords
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY,
    };
  };

  const pointerToClient = (evt) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
      rect,
    };
  };

  const onPointerDown = (evt) => {
    // Only respond to primary button
    if (evt.button !== 0) return;
    evt.preventDefault();
    evt.stopPropagation();
    try {
      canvasRef.current?.setPointerCapture?.(evt.pointerId);
    } catch {}
    setIsDrawing(true);
    const pos = pointerToCanvas(evt);
    setStartPos(pos);
  const client = pointerToClient(evt);
  setStartClientPos({ x: client.x, y: client.y });

    if (tool === 'pen') {
      setAnnotations((prev) => [
        ...prev,
        { type: 'pen', color, size, points: [pos] },
      ]);
      setRedoStack([]);
    } else if (tool === 'text') {
      // begin drawing a text box overlay
      const client = pointerToClient(evt);
      setActiveTextBox({ startClient: { x: client.x, y: client.y }, endClient: { x: client.x, y: client.y } });
      onPointerMove(evt);
    } else {
      // Kick off an initial preview immediately on first click
      // so the user doesn't need to click twice to see drawing start
      onPointerMove(evt);
    }
  };

  const onPointerMove = (evt) => {
    if (!isDrawing) return;
    const pos = pointerToCanvas(evt);
    const client = pointerToClient(evt);
    if (tool === 'pen') {
      setAnnotations((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.type === 'pen') {
          last.points.push(pos);
        }
        return next;
      });
    } else {
      // draw preview on overlay
      const overlay = overlayRef.current;
      const ctx = overlay?.getContext('2d');
      if (!ctx) return;
      // Size overlay to client (CSS pixels) so preview sticks to cursor regardless of zoom
      const rect = client.rect;
      if (overlay.width !== Math.floor(rect.width) || overlay.height !== Math.floor(rect.height)) {
        overlay.width = Math.floor(rect.width);
        overlay.height = Math.floor(rect.height);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = size;
      // Draw using scaled coordinates so preview aligns at cursor
      if (tool === 'rect' && startClientPos) {
        ctx.strokeRect(startClientPos.x, startClientPos.y, client.x - startClientPos.x, client.y - startClientPos.y);
      } else if (tool === 'arrow' && startClientPos) {
        drawArrow(ctx, startClientPos, { x: client.x, y: client.y });
      } else if (tool === 'text') {
        // update active text box preview
        const sx = startClientPos?.x ?? client.x;
        const sy = startClientPos?.y ?? client.y;
        const ex = client.x;
        const ey = client.y;
        setActiveTextBox({ startClient: { x: sx, y: sy }, endClient: { x: ex, y: ey } });
        const w = ex - sx;
        const h = ey - sy;
        ctx.strokeRect(sx, sy, w, h);
      }
      ctx.restore();
    }
  };

  const onPointerUp = (evt) => {
    if (!isDrawing) return;
    try {
      canvasRef.current?.releasePointerCapture?.(evt.pointerId);
    } catch {}
    setIsDrawing(false);
    const end = pointerToCanvas(evt);
    const client = pointerToClient(evt);
    setStartClientPos(null);
    if (tool === 'rect' && startPos) {
      pushAnnotation({ type: 'rect', color, size, start: startPos, end });
    } else if (tool === 'arrow' && startPos) {
      pushAnnotation({ type: 'arrow', color, size, start: startPos, end });
    } else if (tool === 'pen') {
      // already added in move
    } else if (tool === 'text') {
      // finalize box and spawn overlay textarea for typing
      const rect = canvasRef.current.getBoundingClientRect();
      const sx = activeTextBox?.startClient?.x ?? client.x;
      const sy = activeTextBox?.startClient?.y ?? client.y;
      const ex = activeTextBox?.endClient?.x ?? client.x;
      const ey = activeTextBox?.endClient?.y ?? client.y;
      const left = Math.min(sx, ex);
      const top = Math.min(sy, ey);
      const w = Math.abs(ex - sx);
      const h = Math.abs(ey - sy);
      // convert client coords to canvas coords for final commit later
      const scaleX = canvasRef.current.width / rect.width;
      const scaleY = canvasRef.current.height / rect.height;
      const canvasLeft = left * scaleX;
      const canvasTop = top * scaleY;
      const canvasW = Math.max(1, w * scaleX);
      const canvasH = Math.max(1, h * scaleY);
      setTextEditor({ x: left, y: top, w: Math.max(80, w), h: Math.max(30, h), value: '' , canvasX: canvasLeft, canvasY: canvasTop, canvasW, canvasH });
      setActiveTextBox(null);
    }
    // clear overlay preview
    const overlay = overlayRef.current;
    if (overlay) {
  const ctx = overlay.getContext('2d');
  if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, overlay.width, overlay.height);
      }
    }
  };

  const pushAnnotation = (a) => {
    setAnnotations((prev) => {
      const next = [...prev, a];
      setRedoStack([]);
      onChange?.({ annotations: next });
      return next;
    });
  };

  const undo = () => {
    setAnnotations((prev) => {
      if (!prev.length) return prev;
      const next = prev.slice(0, -1);
      setRedoStack((rs) => [prev[prev.length - 1], ...rs]);
      onChange?.({ annotations: next });
      return next;
    });
  };

  const redo = () => {
    setRedoStack((rs) => {
      if (!rs.length) return rs;
      const [first, ...rest] = rs;
      setAnnotations((prev) => {
        const next = [...prev, first];
        onChange?.({ annotations: next });
        return next;
      });
      return rest;
    });
  };

  const exportImage = (type = 'image/png') => {
    // compose base + overlay (overlay should be empty unless previewing)
    const dataUrl = canvasRef.current.toDataURL(type);
    onExport?.(dataUrl);
    return dataUrl;
  };

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        setImage(img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
  // Respect devicePixelRatio to keep internal pixels matching client size
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  overlay.width = Math.floor(width * dpr);
  overlay.height = Math.floor(height * dpr);
  // Ensure CSS size remains the requested logical size
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  overlay.style.width = `${width}px`;
  overlay.style.height = `${height}px`;
    redraw();
  }, [width, height, redraw]);

  // When switching tools, focus the canvas so the very next click begins drawing
  useEffect(() => {
    // Move focus off controls (e.g., select element) back to canvas
    try {
      canvasRef.current?.focus?.();
    } catch {}
  }, [tool]);

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 8 }}>
      <Toolbar
        tool={tool}
        setTool={setTool}
        color={color}
        setColor={setColor}
        size={size}
        setSize={setSize}
        onUndo={undo}
        onRedo={redo}
        onClear={() => { setAnnotations([]); setRedoStack([]); onChange?.({ annotations: [] }); }}
        onExport={() => exportImage('image/png')}
        onFile={handleFile}
        textValue={textValue}
        setTextValue={setTextValue}
      />
      <div style={{ position: 'relative', width, height, border: '1px solid #ddd' }}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { /* avoid default focus/selection toggles */ e.preventDefault(); e.stopPropagation(); }}
          tabIndex={0}
          style={{ touchAction: 'none', cursor: tool === 'text' ? 'text' : 'crosshair', outline: 'none' }}
        />
        <canvas
          ref={overlayRef}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        />
        {textEditor && (
          <textarea
            value={textEditor.value}
            onChange={(e) => setTextEditor((te) => ({ ...te, value: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                // commit on Cmd/Ctrl+Enter
                e.preventDefault();
                commitTextEditor();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setTextEditor(null);
              }
            }}
            style={{
              position: 'absolute',
              left: `${textEditor.x}px`,
              top: `${textEditor.y}px`,
              width: `${textEditor.w}px`,
              height: `${textEditor.h}px`,
              color: color,
              border: '1px dashed ' + color,
              background: 'rgba(255,255,255,0.6)',
              fontSize: Math.max(12, size * 5),
              outline: 'none',
              resize: 'both',
              padding: 4,
            }}
            autoFocus
          />
        )}
      </div>
    </div>
  );
}

function Toolbar({
  tool, setTool,
  color, setColor,
  size, setSize,
  onUndo, onRedo, onClear, onExport,
  onFile,
  textValue, setTextValue,
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <label>Tool:</label>
      <select value={tool} onChange={(e) => setTool(e.target.value)}>
        <option value="pen">Pen</option>
        <option value="arrow">Arrow</option>
        <option value="rect">Rectangle</option>
        <option value="text">Text</option>
      </select>

      <label>Color:</label>
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />

      <label>Size:</label>
      <input type="range" min={1} max={20} value={size} onChange={(e) => setSize(parseInt(e.target.value, 10))} />

      {tool === 'text' && (
        <input
          type="text"
          placeholder="Text"
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          style={{ minWidth: 160 }}
        />
      )}

      <button type="button" onClick={onUndo}>Undo</button>
      <button type="button" onClick={onRedo}>Redo</button>
      <button type="button" onClick={onClear}>Clear</button>
      <button type="button" onClick={onExport}>Export PNG</button>

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span>Load photo</span>
        <input type="file" accept="image/*" onChange={(e) => handleFileInput(e, onFile)} />
      </label>
    </div>
  );
}

function handleFileInput(e, onFile) {
  const file = e.target.files?.[0];
  if (file) onFile(file);
  // reset input so same file can be reselected
  e.target.value = '';
}

function drawMultilineText(ctx, text, x, y, maxWidth, lineHeight) {
  const lines = String(text).split(/\r?\n/);
  let cy = y;
  for (const line of lines) {
    if (maxWidth && ctx.measureText(line).width > maxWidth) {
      // naive wrap: split by spaces
      const words = line.split(' ');
      let current = '';
      for (const w of words) {
        const test = current ? current + ' ' + w : w;
        if (ctx.measureText(test).width > maxWidth) {
          ctx.fillText(current, x, cy);
          cy += lineHeight;
          current = w;
        } else {
          current = test;
        }
      }
      if (current) {
        ctx.fillText(current, x, cy);
        cy += lineHeight;
      }
    } else {
      ctx.fillText(line, x, cy);
      cy += lineHeight;
    }
  }
}

function commitTextEditorExternal(getCtx, textEditor, color, size, pushAnnotation) {
  if (!textEditor) return;
  const ctx = getCtx();
  if (!ctx) return;
  const fontSize = Math.max(12, size * 5);
  // store as annotation to be redrawn later rather than drawing directly
  pushAnnotation({
    type: 'text',
    color,
    size,
    pos: { x: textEditor.canvasX + 4, y: textEditor.canvasY + fontSize },
    text: textEditor.value,
    box: { w: textEditor.canvasW - 8, h: textEditor.canvasH - 8 },
  });
}

function drawArrow(ctx, start, end) {
  const headLength = Math.max(10, ctx.lineWidth * 3);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  // arrow head
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - headLength * Math.cos(angle - Math.PI / 6), end.y - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(end.x - headLength * Math.cos(angle + Math.PI / 6), end.y - headLength * Math.sin(angle + Math.PI / 6));
  ctx.lineTo(end.x, end.y);
  ctx.fill();
}
