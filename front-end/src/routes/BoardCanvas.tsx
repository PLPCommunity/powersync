import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';

type ShapeType = 'rect' | 'ellipse' | 'diamond' | 'circle' | 'triangle' | 'line' | 'arrow' | 'text';

type RectLike = {
  id: string;
  type: 'rect' | 'ellipse' | 'diamond' | 'circle' | 'triangle' | 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: string;
  fill?: string;
  strokeWidth: number;
};

type LineLike = {
  id: string;
  type: 'line' | 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
};

type TextShape = RectLike & {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
};

type Shape = RectLike | LineLike | TextShape;
type Tool = 'select' | ShapeType;

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:5000';

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function measureText(text: string, fontSize: number, fontFamily: string) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${fontSize}px ${fontFamily}`;
  const metrics = ctx.measureText(text || '');
  const width = Math.ceil(metrics.width) + 12;
  const height = Math.ceil(fontSize * 1.4) + 8;
  return { width, height };
}



export function BoardCanvas() {
  const params = useParams();
  const boardId = params.id!;
  const navigate = useNavigate();

  const [boardName, setBoardName] = useState('Untitled document');
  const [tool, setTool] = useState<Tool>('select');
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // interaction state
  const isPointerDownRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const draftShapeRef = useRef<Shape | null>(null);
  const resizeHandleRef = useRef<string | null>(null);
  const mutatedDuringDragRef = useRef(false);
  const isDraggingRef = useRef(false);
  const draggedShapeRef = useRef<Shape | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // text editor overlay
  const [textEditor, setTextEditor] = useState<{ visible: boolean; x: number; y: number; value: string; shapeId: string | null }>({ visible: false, x: 0, y: 0, value: '', shapeId: null });

  // init socket + fetch board
  useEffect(() => {
    socketRef.current = io(API_BASE, { transports: ['websocket'] });
    const abort = new AbortController();
    (async () => {
      const res = await fetch(`${API_BASE}/api/boards/${boardId}`, { signal: abort.signal });
      if (!res.ok) return;
      const data = await res.json();
      setBoardName(data.name || 'Untitled document');
      if (Array.isArray(data.shapes)) setShapes(data.shapes);
      socketRef.current?.emit('join-board', { boardId });
    })();
    return () => { abort.abort(); socketRef.current?.disconnect(); socketRef.current = null; };
  }, [boardId]);

  // wire socket shape events
  useEffect(() => {
    const onCreated = (payload: { shape: Shape }) => {
      // Don't update if we're currently dragging this shape
      if (isDraggingRef.current && draggedShapeRef.current?.id === payload.shape.id) return;
      setShapes((prev) => [...prev.filter((s) => s.id !== payload.shape.id), payload.shape]);
    };
    const onUpdated = (payload: { shapeId: string; props: Partial<Shape> }) => {
      // Don't update if we're currently dragging this shape
      if (isDraggingRef.current && draggedShapeRef.current?.id === payload.shapeId) return;
      setShapes((prev) => prev.map((s) => (s.id === payload.shapeId ? ({ ...s, ...(payload.props as any) } as Shape) : s)));
    };
    const onDeleted = (payload: { shapeId: string }) => {
      setShapes((prev) => prev.filter((s) => s.id !== payload.shapeId));
    };
    socketRef.current?.on('shape-created', onCreated);
    socketRef.current?.on('shape-updated', onUpdated);
    socketRef.current?.on('shape-deleted', onDeleted);
    return () => {
      socketRef.current?.off('shape-created', onCreated);
      socketRef.current?.off('shape-updated', onUpdated);
      socketRef.current?.off('shape-deleted', onDeleted);
    };
  }, []);

  // autosave shapes (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`${API_BASE}/api/boards/${boardId}/shapes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shapes })
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [shapes, boardId]);

  // autosave name (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`${API_BASE}/api/boards/${boardId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: boardName || 'Untitled document' })
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [boardName, boardId]);

  // render canvas
  useEffect(() => { 
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(() => renderCanvas()); 
  }, [shapes, selectedId, tool]);

  function renderCanvas() {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
    const { width, height } = canvas; ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    
    // Render all shapes, but use draggedShapeRef for the currently dragged shape
    for (const shape of shapes) { 
      if (isDraggingRef.current && draggedShapeRef.current?.id === shape.id) {
        drawShape(ctx, draggedShapeRef.current);
        if (selectedId === shape.id) drawSelection(ctx, draggedShapeRef.current);
      } else {
        drawShape(ctx, shape); 
        if (selectedId === shape.id) drawSelection(ctx, shape); 
      }
    }
    
    if (draftShapeRef.current) { ctx.save(); ctx.globalAlpha = 0.7; drawShape(ctx, draftShapeRef.current); ctx.restore(); }
  }

  function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
    ctx.lineWidth = (s as any).strokeWidth || 2; ctx.strokeStyle = (s as any).stroke || '#111111';
    if (isRectLike(s)) {
      if (s.type === 'rect') { if (s.fill) { ctx.fillStyle = s.fill; ctx.fillRect(s.x, s.y, s.w, s.h); } ctx.strokeRect(s.x, s.y, s.w, s.h); return; }
      if (s.type === 'ellipse' || s.type === 'circle') { ctx.beginPath(); const rx = s.type === 'circle' ? Math.max(Math.abs(s.w/2), Math.abs(s.h/2)) : Math.abs(s.w/2); const ry = s.type === 'circle' ? rx : Math.abs(s.h/2); ctx.ellipse(s.x+s.w/2, s.y+s.h/2, rx, ry, 0, 0, Math.PI*2); if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); } ctx.stroke(); return; }
      if (s.type === 'triangle') { const x2 = s.x+s.w, y2 = s.y+s.h; ctx.beginPath(); ctx.moveTo(s.x+s.w/2, s.y); ctx.lineTo(s.x, y2); ctx.lineTo(x2, y2); ctx.closePath(); if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); } ctx.stroke(); return; }
      if (s.type === 'diamond') { const cx = s.x+s.w/2; const cy = s.y+s.h/2; ctx.beginPath(); ctx.moveTo(cx, s.y); ctx.lineTo(s.x+s.w, cy); ctx.lineTo(cx, s.y+s.h); ctx.lineTo(s.x, cy); ctx.closePath(); if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); } ctx.stroke(); return; }
      if (s.type === 'text') { const t = s as TextShape; ctx.font = `${t.fontSize}px ${t.fontFamily}`; ctx.textBaseline = 'top'; if (t.fill && t.fill !== 'transparent') { ctx.fillStyle = t.fill; ctx.fillRect(t.x, t.y, t.w || 0, t.h || t.fontSize*1.4); } ctx.fillStyle = t.color || '#111111'; ctx.fillText(t.text || '', t.x, t.y); return; }
      return;
    }
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke(); if (s.type === 'arrow') drawArrowHead(ctx, s.x1, s.y1, s.x2, s.y2, (s as any).strokeWidth || 2);
  }

  function drawArrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number) {
    const angle = Math.atan2(y2 - y1, x2 - x1); const size = 10 + width; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - size*Math.cos(angle - Math.PI/6), y2 - size*Math.sin(angle - Math.PI/6)); ctx.moveTo(x2, y2); ctx.lineTo(x2 - size*Math.cos(angle + Math.PI/6), y2 - size*Math.sin(angle + Math.PI/6)); ctx.stroke();
  }

  function drawSelection(ctx: CanvasRenderingContext2D, s: Shape) {
    ctx.save(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]); if (isRectLike(s)) { ctx.strokeRect(s.x-2, s.y-2, s.w+4, s.h+4); for (const h of rectHandles(s)) drawHandle(ctx, h.x, h.y); } else { drawHandle(ctx, s.x1, s.y1); drawHandle(ctx, s.x2, s.y2); } ctx.restore();
  }

  function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number) { const size = 6; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1; ctx.beginPath(); ctx.rect(x - size/2, y - size/2, size, size); ctx.fill(); ctx.stroke(); }
  function isRectLike(s: Shape): s is RectLike { return s.type === 'rect' || s.type === 'ellipse' || s.type === 'diamond' || s.type === 'circle' || s.type === 'triangle' || s.type === 'text'; }
  function canvasPoint(e: React.MouseEvent<HTMLCanvasElement>) { const rect = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }

  function handlePointerDown(e: React.MouseEvent<HTMLCanvasElement>) {
    isPointerDownRef.current = true; const p = canvasPoint(e); dragStartRef.current = p;
    if (tool === 'select') { 
      const hit = hitTest(p.x, p.y, shapes); 
      if (hit) { 
        setSelectedId(hit.shape.id); 
        resizeHandleRef.current = hit.handle;
        // Start drag state
        isDraggingRef.current = true;
        draggedShapeRef.current = { ...hit.shape } as Shape;
      } else { 
        setSelectedId(null); 
        resizeHandleRef.current = null; 
        isDraggingRef.current = false;
        draggedShapeRef.current = null;
      } 
      return; 
    }
    if (tool === 'text') return;
    const id = generateId(); const stroke = '#111111'; const strokeWidth = 2;
    if (tool === 'rect' || tool === 'ellipse' || tool === 'diamond' || tool === 'circle' || tool === 'triangle') {
      draftShapeRef.current = { id, type: tool as any, x: p.x, y: p.y, w: 0, h: 0, stroke, strokeWidth } as RectLike;
    } else {
      draftShapeRef.current = { id, type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, stroke, strokeWidth } as LineLike;
    }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(() => renderCanvas());
  }

  function handleDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const p = canvasPoint(e); const hit = hitTest(p.x, p.y, shapes);
    if (hit && (hit.shape as any).type === 'text') { const t = hit.shape as TextShape; setSelectedId(t.id); setTextEditor({ visible: true, x: t.x, y: t.y, value: t.text, shapeId: t.id }); return; }
    const id = generateId(); const base: TextShape = { id, type: 'text', x: p.x, y: p.y, w: 120, h: 28, stroke: '#000000', strokeWidth: 1, fill: 'transparent', text: '', fontSize: 20, fontFamily: 'Inter, Arial', color: '#111111' };
    setShapes((prev) => [...prev, base]); setSelectedId(id); socketRef.current?.emit('shape-create', { boardId, shape: base }); setTextEditor({ visible: true, x: p.x, y: p.y, value: '', shapeId: id });
  }

  function handlePointerMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isPointerDownRef.current) return; 
    const p = canvasPoint(e);
    
    if (tool === 'select' && isDraggingRef.current && draggedShapeRef.current) {
      const start = dragStartRef.current!; 
      const dx = p.x - start.x; 
      const dy = p.y - start.y; 
      dragStartRef.current = p;
      
      let updated: Shape = { ...draggedShapeRef.current } as any;
      
      if (resizeHandleRef.current) {
        // Resizing
        if (isRectLike(updated)) { 
          let { x, y, w, h } = updated; 
          if (resizeHandleRef.current.includes('n')) { const newY = y + dy; h = h - dy; y = newY; } 
          if (resizeHandleRef.current.includes('s')) { h = h + dy; } 
          if (resizeHandleRef.current.includes('w')) { const newX = x + dx; w = w - dx; x = newX; } 
          if (resizeHandleRef.current.includes('e')) { w = w + dx; } 
          const norm = normalizeRect({ x, y, w, h }); 
          (updated as RectLike).x = norm.x; 
          (updated as RectLike).y = norm.y; 
          (updated as RectLike).w = norm.w; 
          (updated as RectLike).h = norm.h; 
        }
        else { 
          if (resizeHandleRef.current === 'start') { (updated as LineLike).x1 += dx; (updated as LineLike).y1 += dy; } 
          else if (resizeHandleRef.current === 'end') { (updated as LineLike).x2 += dx; (updated as LineLike).y2 += dy; } 
        }
      } else {
        // Moving
        if (isRectLike(updated)) { 
          (updated as RectLike).x += dx; 
          (updated as RectLike).y += dy; 
        } else { 
          (updated as LineLike).x1 += dx; 
          (updated as LineLike).y1 += dy; 
          (updated as LineLike).x2 += dx; 
          (updated as LineLike).y2 += dy; 
        }
      }
      
      // Update the dragged shape reference for smooth rendering
      draggedShapeRef.current = updated;
      mutatedDuringDragRef.current = true;
      
      // Use requestAnimationFrame for smooth rendering
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = requestAnimationFrame(() => renderCanvas());
      return;
    }
    
    // Handle draft shape creation
    if (draftShapeRef.current) { 
      const d = draftShapeRef.current; 
      if (isRectLike(d)) { 
        let dw = p.x - d.x; 
        let dh = p.y - d.y; 
        if ((d as RectLike).type === 'circle') { 
          const size = Math.max(Math.abs(dw), Math.abs(dh)); 
          d.w = Math.sign(dw || 1) * size; 
          d.h = Math.sign(dh || 1) * size; 
        } else { 
          d.w = dw; 
          d.h = dh; 
        } 
      } else { 
        d.x2 = p.x; 
        d.y2 = p.y; 
      } 
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = requestAnimationFrame(() => renderCanvas());
    }
  }

  function handlePointerUp() {
    isPointerDownRef.current = false; 
    
    // Handle draft shape creation
    if (draftShapeRef.current) { 
      const d = draftShapeRef.current; 
      let toAdd: Shape = d as any; 
      if (isRectLike(d)) { 
        const norm = normalizeRect({ x: d.x, y: d.y, w: d.w, h: d.h }); 
        toAdd = { ...(d as RectLike), ...norm } as RectLike; 
      } 
      setShapes((prev) => [...prev, toAdd]); 
      socketRef.current?.emit('shape-create', { boardId, shape: toAdd }); 
      draftShapeRef.current = null; 
    }
    
    // Handle end of dragging
    if (isDraggingRef.current && draggedShapeRef.current && mutatedDuringDragRef.current) {
      // Commit the dragged shape to the main state and emit socket event
      const finalShape = draggedShapeRef.current;
      const originalShape = shapes.find(s => s.id === finalShape.id);
      
      if (originalShape) {
        setShapes((prev) => prev.map((s) => (s.id === finalShape.id ? finalShape : s)));
        
        // Send the final position via socket (only once at the end)
        const diff = diffShape(originalShape, finalShape);
        if (Object.keys(diff).length > 0) {
          socketRef.current?.emit('shape-update', { boardId, shapeId: finalShape.id, props: diff });
        }
      }
    }
    
    // Reset drag state
    isDraggingRef.current = false;
    draggedShapeRef.current = null;
    resizeHandleRef.current = null; 
    dragStartRef.current = null; 
    mutatedDuringDragRef.current = false;
  }

  function rectHandles(s: RectLike) { const x2 = s.x + s.w; const y2 = s.y + s.h; return [ { name: 'nw', x: s.x, y: s.y }, { name: 'ne', x: x2, y: s.y }, { name: 'sw', x: s.x, y: y2 }, { name: 'se', x: x2, y: y2 } ]; }
  function hitTest(x: number, y: number, list: Shape[]): { shape: Shape; handle: string | null } | null { for (let i = list.length - 1; i >= 0; i--) { const s = list[i]; if (isRectLike(s)) { const handle = rectHandles(s).find((h) => Math.abs(h.x - x) <= 6 && Math.abs(h.y - y) <= 6); if (handle) return { shape: s, handle: handle.name as string } as any; if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return { shape: s, handle: null }; } else { if (distance(x, y, s.x1, s.y1) <= 6) return { shape: s, handle: 'start' } as any; if (distance(x, y, s.x2, s.y2) <= 6) return { shape: s, handle: 'end' } as any; if (pointToSegmentDistance(x, y, s.x1, s.y1, s.x2, s.y2) < 6) return { shape: s, handle: null }; } } return null; }
  function distance(ax: number, ay: number, bx: number, by: number) { return Math.hypot(ax - bx, ay - by); }
  function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number) { const A = px - x1; const B = py - y1; const C = x2 - x1; const D = y2 - y1; const dot = A * C + B * D; const lenSq = C * C + D * D || 1; let t = dot / lenSq; t = Math.max(0, Math.min(1, t)); const xx = x1 + t * C; const yy = y1 + t * D; return Math.hypot(px - xx, py - yy); }
  function normalizeRect(r: { x: number; y: number; w: number; h: number }) { let { x, y, w, h } = r; if (w < 0) { x = x + w; w = -w; } if (h < 0) { y = y + h; h = -h; } return { x, y, w, h }; }
  function diffShape(prev: Shape, next: Shape): Partial<Shape> { const diff: any = {}; for (const k of Object.keys(next) as (keyof Shape)[]) { if ((next as any)[k] !== (prev as any)[k]) diff[k] = (next as any)[k]; } return diff; }

  // UI
  const palette = ['#111111', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#000000', '#FFFFFF'];

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #e5e5e5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/')}>{'← Back'}</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <ToolButton active={tool === 'select'} onClick={() => setTool('select')}>Select</ToolButton>
            <ToolButton active={tool === 'rect'} onClick={() => setTool('rect')}>□</ToolButton>
            <ToolButton active={tool === 'ellipse'} onClick={() => setTool('ellipse')}>◯</ToolButton>
            <ToolButton active={tool === 'circle'} onClick={() => setTool('circle')}>●</ToolButton>
            <ToolButton active={tool === 'diamond'} onClick={() => setTool('diamond')}>◇</ToolButton>
            <ToolButton active={tool === 'triangle'} onClick={() => setTool('triangle')}>△</ToolButton>
            <ToolButton active={tool === 'line'} onClick={() => setTool('line')}>─</ToolButton>
            <ToolButton active={tool === 'arrow'} onClick={() => setTool('arrow')}>→</ToolButton>
            <ToolButton active={tool === 'text'} onClick={() => setTool('text')}>T</ToolButton>
          </div>
        </div>
        <input
          value={boardName}
          onChange={(e) => setBoardName(e.target.value)}
          placeholder="Untitled document"
          style={{ border: 'none', fontSize: 16, textAlign: 'right' }}
        />
      </div>

      {/* Context inspector (only when selected) */}
      {selectedId && (() => {
        const sel = shapes.find((s) => s.id === selectedId); if (!sel) return null;
        const updateSel = (props: any) => { setShapes((prev) => prev.map((s) => (s.id === selectedId ? ({ ...s, ...props } as Shape) : s))); socketRef.current?.emit('shape-update', { boardId, shapeId: selectedId, props }); };
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderBottom: '1px dashed #cbd5e1' }}>
            <span style={{ opacity: 0.7 }}>Selected: {(sel as any).type}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Width</span>
              <input type="number" min={1} max={12} value={(sel as any).strokeWidth || 2} onChange={(e) => { updateSel({ strokeWidth: Number(e.target.value) }); }} style={{ width: 64 }} />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {palette.map((c) => (
                <button key={c} title={c} onClick={() => { if ((sel as any).type === 'text') updateSel({ color: c }); else if (isRectLike(sel)) updateSel({ fill: c }); else updateSel({ stroke: c }); }} style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid #e5e5e5', background: c }} />
              ))}
            </div>
          </div>
        );
      })()}

      {/* Canvas area fills remaining space */}
      <div ref={wrapperRef} style={{ position: 'relative', flex: 1 }}>
        <canvas
          ref={canvasRef}
          width={window.innerWidth}
          height={window.innerHeight - 100}
          onMouseDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          style={{ width: '100%', height: '100%', background: '#ffffff' }}
        />
        {textEditor.visible && (
          <textarea
            autoFocus
            value={textEditor.value}
            onChange={(e) => setTextEditor((t) => ({ ...t, value: e.target.value }))}
            onBlur={() => finalizeTextEditor()}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finalizeTextEditor(); } }}
            style={{ position: 'absolute', left: textEditor.x, top: textEditor.y, width: 240, height: 60, border: '1px solid #3b82f6', borderRadius: 6, padding: 6, background: '#fff' }}
          />
        )}
      </div>
    </div>
  );

  function finalizeTextEditor() {
    if (!textEditor.visible) return; const shape = shapes.find((s) => s.id === textEditor.shapeId) as TextShape | undefined; if (!shape) { setTextEditor({ visible: false, x: 0, y: 0, value: '', shapeId: null }); return; }
    const value = textEditor.value; if (!value.trim()) { const nextList = shapes.filter((s) => s.id !== shape.id); setShapes(nextList); socketRef.current?.emit('shape-delete', { boardId, shapeId: shape.id }); setTextEditor({ visible: false, x: 0, y: 0, value: '', shapeId: null }); return; }
    const dim = measureText(value, shape.fontSize, shape.fontFamily); const next: TextShape = { ...shape, text: value, w: dim.width, h: dim.height }; setShapes((prev) => prev.map((s) => (s.id === shape.id ? next : s))); socketRef.current?.emit('shape-update', { boardId, shapeId: shape.id, props: { text: next.text, w: next.w, h: next.h } }); setTextEditor({ visible: false, x: 0, y: 0, value: '', shapeId: null });
  }
}

function ToolButton(props: { active?: boolean; onClick?: () => void; children: any }) {
  return (
    <button onClick={props.onClick} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: props.active ? '#eff6ff' : 'transparent' }}>{props.children}</button>
  );
}


