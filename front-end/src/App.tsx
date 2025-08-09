import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import './App.css';

type Board = {
  _id: string;
  name: string;
  description?: string;
};

type ShapeType = 'rect' | 'ellipse' | 'diamond' | 'line' | 'arrow';

type RectLike = {
  id: string;
  type: 'rect' | 'ellipse' | 'diamond';
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

type Shape = RectLike | LineLike;
type Tool = 'select' | ShapeType;

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function App() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);

  const [tool, setTool] = useState<Tool>('select');
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Interaction state
  const isPointerDownRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const draftShapeRef = useRef<Shape | null>(null);
  const resizeHandleRef = useRef<string | null>(null);

  // Initialize socket
  useEffect(() => {
    socketRef.current = io(API_BASE, { transports: ['websocket'] });
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Load boards
  useEffect(() => {
    fetch(`${API_BASE}/api/boards`)
      .then((r) => r.json())
      .then(setBoards)
      .catch(() => {});
  }, []);

  // Join board and wire shape events
  useEffect(() => {
    if (!activeBoard) return;
    socketRef.current?.emit('join-board', { boardId: activeBoard._id });

    const onCreated = (payload: { shape: Shape }) => {
      setShapes((prev) => [...prev.filter((s) => s.id !== payload.shape.id), payload.shape]);
    };
    const onUpdated = (payload: { shapeId: string; props: Partial<Shape> }) => {
      setShapes((prev) => prev.map((s) => (s.id === payload.shapeId ? { ...s, ...(payload.props as any) } : s)));
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
  }, [activeBoard]);

  // Rendering
  useEffect(() => {
    renderCanvas();
  }, [shapes, selectedId, tool]);

  function renderCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const shape of shapes) {
      drawShape(ctx, shape);
      if (selectedId === shape.id) {
        drawSelection(ctx, shape);
      }
    }

    // Draft
    if (draftShapeRef.current) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      drawShape(ctx, draftShapeRef.current);
      ctx.restore();
    }
  }

  function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
    ctx.lineWidth = (s as any).strokeWidth || 2;
    ctx.strokeStyle = (s as any).stroke || '#111111';
    if (isRectLike(s)) {
      if (s.type === 'rect') {
        if (s.fill) {
          ctx.fillStyle = s.fill;
          ctx.fillRect(s.x, s.y, s.w, s.h);
        }
        ctx.strokeRect(s.x, s.y, s.w, s.h);
        return;
      }
      if (s.type === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, 0, Math.PI * 2);
        if (s.fill) {
          ctx.fillStyle = s.fill;
          ctx.fill();
        }
        ctx.stroke();
        return;
      }
      if (s.type === 'diamond') {
        const cx = s.x + s.w / 2;
        const cy = s.y + s.h / 2;
        ctx.beginPath();
        ctx.moveTo(cx, s.y);
        ctx.lineTo(s.x + s.w, cy);
        ctx.lineTo(cx, s.y + s.h);
        ctx.lineTo(s.x, cy);
        ctx.closePath();
        if (s.fill) {
          ctx.fillStyle = s.fill;
          ctx.fill();
        }
        ctx.stroke();
        return;
      }
      return;
    }
    // Line or arrow
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    if (s.type === 'arrow') {
      drawArrowHead(ctx, s.x1, s.y1, s.x2, s.y2, (s as any).strokeWidth || 2);
    }
  }

  function drawArrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = 10 + width;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function drawSelection(ctx: CanvasRenderingContext2D, s: Shape) {
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    if (isRectLike(s)) {
      ctx.strokeRect(s.x - 2, s.y - 2, s.w + 4, s.h + 4);
      const handles = rectHandles(s);
      for (const h of handles) drawHandle(ctx, h.x, h.y);
    } else {
      // line/arrow endpoints
      drawHandle(ctx, s.x1, s.y1);
      drawHandle(ctx, s.x2, s.y2);
    }
    ctx.restore();
  }

  function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const size = 6;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x - size / 2, y - size / 2, size, size);
    ctx.fill();
    ctx.stroke();
  }

  function isRectLike(s: Shape): s is RectLike {
    return s.type === 'rect' || s.type === 'ellipse' || s.type === 'diamond';
  }

  function canvasPoint(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!activeBoard) return;
    isPointerDownRef.current = true;
    const p = canvasPoint(e);
    dragStartRef.current = p;

    if (tool === 'select') {
      const hit = hitTest(p.x, p.y, shapes);
      if (hit) {
        setSelectedId(hit.shape.id);
        resizeHandleRef.current = hit.handle; // may be null
      } else {
        setSelectedId(null);
        resizeHandleRef.current = null;
      }
      return;
    }

    // Begin drafting new shape
    const id = generateId();
    const stroke = '#111111';
    const strokeWidth = 2;
    if (tool === 'rect' || tool === 'ellipse' || tool === 'diamond') {
      draftShapeRef.current = {
        id,
        type: tool,
        x: p.x,
        y: p.y,
        w: 0,
        h: 0,
        stroke,
        strokeWidth,
      } as RectLike;
    } else {
      draftShapeRef.current = {
        id,
        type: tool,
        x1: p.x,
        y1: p.y,
        x2: p.x,
        y2: p.y,
        stroke,
        strokeWidth,
      } as LineLike;
    }
    renderCanvas();
  }

  function handlePointerMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isPointerDownRef.current) return;
    const p = canvasPoint(e);

    // Resizing or dragging selection
    if (tool === 'select') {
      if (!selectedId) return;
      const idx = shapes.findIndex((s) => s.id === selectedId);
      if (idx === -1) return;
      const selected = shapes[idx];
      const start = dragStartRef.current!;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      dragStartRef.current = p;

      if (resizeHandleRef.current) {
        // resize
        let updated: Shape = { ...selected } as any;
        if (isRectLike(updated)) {
          let { x, y, w, h } = updated;
          if (resizeHandleRef.current.includes('n')) {
            const newY = y + dy;
            h = h - dy;
            y = newY;
          }
          if (resizeHandleRef.current.includes('s')) {
            h = h + dy;
          }
          if (resizeHandleRef.current.includes('w')) {
            const newX = x + dx;
            w = w - dx;
            x = newX;
          }
          if (resizeHandleRef.current.includes('e')) {
            w = w + dx;
          }
          const norm = normalizeRect({ x, y, w, h });
          (updated as RectLike).x = norm.x;
          (updated as RectLike).y = norm.y;
          (updated as RectLike).w = norm.w;
          (updated as RectLike).h = norm.h;
        } else {
          // line endpoints
          if (resizeHandleRef.current === 'start') {
            (updated as LineLike).x1 += dx;
            (updated as LineLike).y1 += dy;
          } else if (resizeHandleRef.current === 'end') {
            (updated as LineLike).x2 += dx;
            (updated as LineLike).y2 += dy;
          }
        }
        setShapes((prev) => prev.map((s) => (s.id === selectedId ? updated : s)));
        socketRef.current?.emit('shape-update', { boardId: activeBoard!._id, shapeId: selectedId, props: diffShape(selected, updated) });
      } else {
        // drag move
        if (isRectLike(selected)) {
          const updated = { ...selected, x: selected.x + dx, y: selected.y + dy } as RectLike;
          setShapes((prev) => prev.map((s) => (s.id === selectedId ? updated : s)));
          socketRef.current?.emit('shape-update', { boardId: activeBoard!._id, shapeId: selectedId, props: { x: updated.x, y: updated.y } });
        } else {
          const updated = { ...selected, x1: selected.x1 + dx, y1: selected.y1 + dy, x2: selected.x2 + dx, y2: selected.y2 + dy } as LineLike;
          setShapes((prev) => prev.map((s) => (s.id === selectedId ? updated : s)));
          socketRef.current?.emit('shape-update', { boardId: activeBoard!._id, shapeId: selectedId, props: { x1: updated.x1, y1: updated.y1, x2: updated.x2, y2: updated.y2 } });
        }
      }
      renderCanvas();
      return;
    }

    // Drafting new shape
    if (draftShapeRef.current) {
      const d = draftShapeRef.current;
      if (isRectLike(d)) {
        d.w = p.x - d.x;
        d.h = p.y - d.y;
      } else {
        d.x2 = p.x;
        d.y2 = p.y;
      }
      renderCanvas();
    }
  }

  function handlePointerUp() {
    if (!activeBoard) return;
    isPointerDownRef.current = false;

    if (draftShapeRef.current) {
      // Normalize and commit
      const d = draftShapeRef.current;
      let toAdd: Shape = d as any;
      if (isRectLike(d)) {
        const norm = normalizeRect({ x: d.x, y: d.y, w: d.w, h: d.h });
        toAdd = { ...(d as RectLike), ...norm } as RectLike;
      }
      setShapes((prev) => [...prev, toAdd]);
      socketRef.current?.emit('shape-create', { boardId: activeBoard._id, shape: toAdd });
      draftShapeRef.current = null;
    }
    resizeHandleRef.current = null;
    dragStartRef.current = null;
  }

  function rectHandles(s: RectLike) {
    const x2 = s.x + s.w;
    const y2 = s.y + s.h;
    return [
      { name: 'nw', x: s.x, y: s.y },
      { name: 'ne', x: x2, y: s.y },
      { name: 'sw', x: s.x, y: y2 },
      { name: 'se', x: x2, y: y2 },
    ];
  }

  function hitTest(x: number, y: number, list: Shape[]): { shape: Shape; handle: string | null } | null {
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (isRectLike(s)) {
        const handle = rectHandles(s).find((h) => Math.abs(h.x - x) <= 6 && Math.abs(h.y - y) <= 6);
        if (handle) return { shape: s, handle: handle.name as string } as any;
        if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) {
          return { shape: s, handle: null };
        }
      } else {
        if (distance(x, y, s.x1, s.y1) <= 6) return { shape: s, handle: 'start' } as any;
        if (distance(x, y, s.x2, s.y2) <= 6) return { shape: s, handle: 'end' } as any;
        if (pointToSegmentDistance(x, y, s.x1, s.y1, s.x2, s.y2) < 6) return { shape: s, handle: null };
      }
    }
    return null;
  }

  function distance(ax: number, ay: number, bx: number, by: number) {
    return Math.hypot(ax - bx, ay - by);
  }

  function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D || 1;
    let t = dot / lenSq;
    t = Math.max(0, Math.min(1, t));
    const xx = x1 + t * C;
    const yy = y1 + t * D;
    return Math.hypot(px - xx, py - yy);
  }

  function normalizeRect(r: { x: number; y: number; w: number; h: number }) {
    let { x, y, w, h } = r;
    if (w < 0) {
      x = x + w;
      w = -w;
    }
    if (h < 0) {
      y = y + h;
      h = -h;
    }
    return { x, y, w, h };
  }

  function diffShape(prev: Shape, next: Shape): Partial<Shape> {
    const diff: any = {};
    for (const k of Object.keys(next) as (keyof Shape)[]) {
      if ((next as any)[k] !== (prev as any)[k]) diff[k] = (next as any)[k];
    }
    return diff;
  }

  const submitBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/api/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    const created = await res.json();
    if (res.ok) {
      setBoards((prev) => [created, ...prev]);
      setName('');
      setDescription('');
    } else {
      alert(created?.message || 'Failed to create board');
    }
  };

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: 24 }}>
      <h1>Boards</h1>
      <form onSubmit={submitBoard} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Board name" required />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" />
        <button type="submit">Create</button>
      </form>

      {!activeBoard && (
        <ul style={{ display: 'grid', gap: 8, padding: 0, listStyle: 'none' }}>
          {boards.map((b) => (
            <li key={b._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e5e5e5', padding: 12, borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{b.name}</div>
                {b.description && <div style={{ opacity: 0.75, fontSize: 12 }}>{b.description}</div>}
              </div>
              <button onClick={() => { setActiveBoard(b); setShapes([]); setSelectedId(null); }}>Open</button>
            </li>
          ))}
        </ul>
      )}

      {activeBoard && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2>{activeBoard.name}</h2>
            <button onClick={() => setActiveBoard(null)}>Back</button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, padding: 8, border: '1px solid #e5e5e5', borderRadius: 8 }}>
            <ToolButton active={tool === 'select'} onClick={() => setTool('select')}>Select</ToolButton>
            <div style={{ width: 1, height: 20, background: '#e5e5e5' }} />
            <ToolButton active={tool === 'rect'} onClick={() => setTool('rect')}>□</ToolButton>
            <ToolButton active={tool === 'ellipse'} onClick={() => setTool('ellipse')}>○</ToolButton>
            <ToolButton active={tool === 'diamond'} onClick={() => setTool('diamond')}>◇</ToolButton>
            <ToolButton active={tool === 'line'} onClick={() => setTool('line')}>─</ToolButton>
            <ToolButton active={tool === 'arrow'} onClick={() => setTool('arrow')}>→</ToolButton>
          </div>

          <canvas
            ref={canvasRef}
            width={1000}
            height={620}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            style={{ width: 1000, height: 620, border: '1px solid #e5e5e5', borderRadius: 8, background: '#ffffff', cursor: tool === 'select' ? 'default' : 'crosshair' }}
          />
        </section>
      )}
    </main>
  );
}

function ToolButton(props: { active?: boolean; onClick?: () => void; children: any }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        padding: '6px 10px',
        borderRadius: 6,
        border: '1px solid ' + (props.active ? '#3b82f6' : '#e5e5e5'),
        background: props.active ? '#eff6ff' : '#ffffff',
      }}
    >
      {props.children}
    </button>
  );
}

export default App;
