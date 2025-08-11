// src/components/BoardCanvas.tsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";

/** -------------------- Types -------------------- */
type ShapeType =
  | "rect"
  | "ellipse"
  | "diamond"
  | "circle"
  | "triangle"
  | "line"
  | "arrow"
  | "arrowDouble"
  | "orthogonal"
  | "text"
  | "freehand"
  | "cylinder"
  | "cloud"
  | "callout"
  | "starburst";

type Tool = "select" | ShapeType;

type RectLike = {
  id: string;
  type:
    | "rect"
    | "ellipse"
    | "diamond"
    | "circle"
    | "triangle"
    | "text"
    | "cylinder"
    | "cloud"
    | "callout"
    | "starburst";
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
  type: "line" | "arrow" | "arrowDouble" | "orthogonal";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
};

type TextShape = RectLike & {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
};

type Freehand = {
  id: string;
  type: "freehand";
  points: { x: number; y: number }[];
  stroke: string;
  strokeWidth: number;
  bbox: { x: number; y: number; w: number; h: number };
};

type Shape = RectLike | LineLike | TextShape | Freehand;

/** -------------------- Config / Utils -------------------- */
const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:5000";
const GRID_SIZE = 24; // world units
const GRID_BG = "#fbfbfd";
const GRID_LINE = "#eef1f5";
const GRID_BOLD = "#e5e9f0";

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function measureText(text: string, fontSize: number, fontFamily: string) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${fontSize}px ${fontFamily}`;
  const m = ctx.measureText(text || "");
  const width = Math.ceil(m.width) + 12;
  const height = Math.ceil(fontSize * 1.4) + 8;
  return { width, height };
}
function isRectLike(s: Shape): s is RectLike {
  return (
    s.type === "rect" ||
    s.type === "ellipse" ||
    s.type === "diamond" ||
    s.type === "circle" ||
    s.type === "triangle" ||
    s.type === "text" ||
    s.type === "cylinder" ||
    s.type === "cloud" ||
    s.type === "callout" ||
    s.type === "starburst"
  );
}
function isLineLike(s: Shape): s is LineLike {
  return s.type === "line" || s.type === "arrow" || s.type === "arrowDouble" || s.type === "orthogonal";
}
function isFreehand(s: Shape): s is Freehand {
  return s.type === "freehand";
}

/** -------------------- Component -------------------- */
export function BoardCanvas() {
  const params = useParams();
  const boardId = params.id!;
  const navigate = useNavigate();

  const [boardName, setBoardName] = useState("Untitled document");
  const [tool, setTool] = useState<Tool>("select");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Interaction refs
  const isPointerDownRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const draftShapeRef = useRef<Shape | null>(null);
  const resizeHandleRef = useRef<string | null>(null);
  const mutatedDuringDragRef = useRef(false);
  const isDraggingRef = useRef(false);
  const draggedShapeRef = useRef<Shape | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Camera (for infinite canvas)
  const cameraRef = useRef<{ tx: number; ty: number; scale: number }>({ tx: 0, ty: 0, scale: 1 });
  const [viewVersion, setViewVersion] = useState(0); // triggers React rerender for overlay on pan/zoom

  // Text editor overlay
  const [textEditor, setTextEditor] = useState<{
    visible: boolean;
    x: number; // world coords
    y: number;
    value: string;
    shapeId: string | null;
  }>({ visible: false, x: 0, y: 0, value: "", shapeId: null });

  // Clipboard + mirrors for stable keyboard handlers
  const clipboardRef = useRef<Shape | null>(null);
  const shapesRef = useRef<Shape[]>([]);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  /** -------------------- Init socket + fetch board -------------------- */
  useEffect(() => {
    socketRef.current = io(API_BASE, { transports: ["websocket"] });
    const abort = new AbortController();

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/boards/${boardId}`, { signal: abort.signal });
        if (!res.ok) return;
        const data = await res.json();
        setBoardName(data.name || "Untitled document");
        if (Array.isArray(data.shapes)) setShapes(data.shapes);
        socketRef.current?.emit("join-board", { boardId });
      } catch {
        /* ignore */
      }
    })();

    return () => {
      abort.abort();
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [boardId]);

  /** -------------------- Socket shape events -------------------- */
  useEffect(() => {
    const onCreated = (payload: { shape: Shape }) => {
      if (isDraggingRef.current && draggedShapeRef.current?.id === payload.shape.id) return;
      setShapes((prev) => [...prev.filter((s) => s.id !== payload.shape.id), payload.shape]);
    };
    const onUpdated = (payload: { shapeId: string; props: Partial<Shape> }) => {
      if (isDraggingRef.current && draggedShapeRef.current?.id === payload.shapeId) return;
      setShapes((prev) =>
        prev.map((s) => (s.id === payload.shapeId ? ({ ...s, ...(payload.props as any) } as Shape) : s))
      );
    };
    const onDeleted = (payload: { shapeId: string }) => {
      setShapes((prev) => prev.filter((s) => s.id !== payload.shapeId));
    };

    socketRef.current?.on("shape-created", onCreated);
    socketRef.current?.on("shape-updated", onUpdated);
    socketRef.current?.on("shape-deleted", onDeleted);

    return () => {
      socketRef.current?.off("shape-created", onCreated);
      socketRef.current?.off("shape-updated", onUpdated);
      socketRef.current?.off("shape-deleted", onDeleted);
    };
  }, []);

  /** -------------------- Autosave -------------------- */
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`${API_BASE}/api/boards/${boardId}/shapes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shapes }),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [shapes, boardId]);

  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`${API_BASE}/api/boards/${boardId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: boardName || "Untitled document" }),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [boardName, boardId]);

  /** -------------------- Render -------------------- */
  useEffect(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(() => renderCanvas());
  }, [shapes, selectedId, tool, viewVersion]);

  function renderCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    const cam = cameraRef.current;
    // Reset transform to draw background & grid in screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Background
    ctx.fillStyle = GRID_BG;
    ctx.fillRect(0, 0, width, height);

    // Grid (world-aware)
    drawGrid(ctx, width, height, cam);

    // Apply camera transform for shapes
    ctx.setTransform(cam.scale, 0, 0, cam.scale, cam.tx, cam.ty);

    // Shapes
    for (const shape of shapes) {
      if (isDraggingRef.current && draggedShapeRef.current?.id === shape.id) {
        drawShape(ctx, draggedShapeRef.current!);
        if (selectedId === shape.id) drawSelection(ctx, draggedShapeRef.current!);
      } else {
        drawShape(ctx, shape);
        if (selectedId === shape.id) drawSelection(ctx, shape);
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

  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, cam: { tx: number; ty: number; scale: number }) {
    const s = cam.scale;

    // visible world bounds
    const leftW = -cam.tx / s;
    const topW = -cam.ty / s;
    const rightW = leftW + w / s;
    const bottomW = topW + h / s;

    const xStart = Math.floor(leftW / GRID_SIZE) * GRID_SIZE;
    const xEnd = Math.ceil(rightW / GRID_SIZE) * GRID_SIZE;
    const yStart = Math.floor(topW / GRID_SIZE) * GRID_SIZE;
    const yEnd = Math.ceil(bottomW / GRID_SIZE) * GRID_SIZE;

    ctx.beginPath();
    for (let x = xStart; x <= xEnd; x += GRID_SIZE) {
      const sx = x * s + cam.tx;
      ctx.moveTo(sx + 0.5, 0);
      ctx.lineTo(sx + 0.5, h);
    }
    for (let y = yStart; y <= yEnd; y += GRID_SIZE) {
      const sy = y * s + cam.ty;
      ctx.moveTo(0, sy + 0.5);
      ctx.lineTo(w, sy + 0.5);
    }
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    ctx.stroke();

    // every 5th line slightly bolder
    ctx.beginPath();
    for (let x = xStart; x <= xEnd; x += GRID_SIZE * 5) {
      const sx = x * s + cam.tx;
      ctx.moveTo(sx + 0.5, 0);
      ctx.lineTo(sx + 0.5, h);
    }
    for (let y = yStart; y <= yEnd; y += GRID_SIZE * 5) {
      const sy = y * s + cam.ty;
      ctx.moveTo(0, sy + 0.5);
      ctx.lineTo(w, sy + 0.5);
    }
    ctx.strokeStyle = GRID_BOLD;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** -------------------- Draw shapes -------------------- */
  function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
    ctx.lineWidth = (s as any).strokeWidth || 2;
    ctx.strokeStyle = (s as any).stroke || "#111111";

    if (isFreehand(s)) {
      ctx.beginPath();
      if (!s.points.length) return;
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
      return;
    }

    if (isRectLike(s)) {
      if (s.type === "rect") {
        if (s.fill) {
          ctx.fillStyle = s.fill;
          ctx.fillRect(s.x, s.y, s.w, s.h);
        }
        ctx.strokeRect(s.x, s.y, s.w, s.h);
        return;
      }
      if (s.type === "ellipse" || s.type === "circle") {
        ctx.beginPath();
        const rx = s.type === "circle" ? Math.max(Math.abs(s.w / 2), Math.abs(s.h / 2)) : Math.abs(s.w / 2);
        const ry = s.type === "circle" ? rx : Math.abs(s.h / 2);
        ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, rx, ry, 0, 0, Math.PI * 2);
        if (s.fill) {
          ctx.fillStyle = s.fill;
          ctx.fill();
        }
        ctx.stroke();
        return;
      }
      if (s.type === "triangle") {
        const x2 = s.x + s.w;
        const y2 = s.y + s.h;
        ctx.beginPath();
        ctx.moveTo(s.x + s.w / 2, s.y);
        ctx.lineTo(s.x, y2);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        if (s.fill) {
          ctx.fillStyle = s.fill;
          ctx.fill();
        }
        ctx.stroke();
        return;
      }
      if (s.type === "diamond") {
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
      if (s.type === "cylinder") {
        drawCylinder(ctx, s);
        return;
      }
      if (s.type === "cloud") {
        drawCloud(ctx, s);
        return;
      }
      if (s.type === "callout") {
        drawCallout(ctx, s);
        return;
      }
      if (s.type === "starburst") {
        drawStarburst(ctx, s);
        return;
      }
      if (s.type === "text") {
        const t = s as TextShape;
        ctx.font = `${t.fontSize}px ${t.fontFamily}`;
        ctx.textBaseline = "top";
        if (t.fill && t.fill !== "transparent") {
          ctx.fillStyle = t.fill;
          ctx.fillRect(t.x, t.y, t.w || 0, t.h || t.fontSize * 1.4);
        }
        ctx.fillStyle = t.color || "#111111";
        ctx.fillText(t.text || "", t.x, t.y);
        return;
      }
      return;
    }

    // line / arrow / arrowDouble / orthogonal
    const l = s as LineLike;

    if (l.type === "orthogonal") {
      const bend = { x: l.x2, y: l.y1 }; // right-angle elbow
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(bend.x, bend.y);
      ctx.lineTo(l.x2, l.y2);
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();

    if (l.type === "arrow" || l.type === "arrowDouble") {
      drawArrowHead(ctx, l.x1, l.y1, l.x2, l.y2, (l as any).strokeWidth || 2);
      if (l.type === "arrowDouble") {
        // reverse head
        drawArrowHead(ctx, l.x2, l.y2, l.x1, l.y1, (l as any).strokeWidth || 2);
      }
    }
  }

  function drawArrowHead(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    width: number
  ) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = 10 + width;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function drawCylinder(ctx: CanvasRenderingContext2D, r: RectLike) {
    const { x, y, w, h } = r;
    const rx = Math.abs(w / 2);
    const ry = Math.abs(Math.min(h / 6, Math.abs(w) / 4)); // ellipse thickness
    const cx = x + w / 2;

    // body
    if (r.fill) {
      ctx.fillStyle = r.fill;
      ctx.fillRect(x, y + ry, w, h - 2 * ry);
    }
    ctx.strokeRect(x, y + ry, w, h - 2 * ry);

    // top ellipse (solid)
    ctx.beginPath();
    ctx.ellipse(cx, y + ry, rx, ry, 0, 0, Math.PI * 2);
    if (r.fill) {
      ctx.fillStyle = r.fill;
      ctx.fill();
    }
    ctx.stroke();

    // bottom ellipse (front solid, back dashed)
    // back (dashed)
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.ellipse(cx, y + h - ry, rx, ry, 0, Math.PI, 0, true);
    ctx.stroke();
    ctx.restore();

    // front
    ctx.beginPath();
    ctx.ellipse(cx, y + h - ry, rx, ry, 0, 0, Math.PI);
    ctx.stroke();
  }

  function drawCloud(ctx: CanvasRenderingContext2D, r: RectLike) {
    const { x, y, w, h } = r;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = Math.abs(w / 2);
    const ry = Math.abs(h / 2);

    // approximate cloud with several circles
    const blobs = [
      { dx: -0.35, dy: 0.1, rr: 0.5 },
      { dx: -0.05, dy: -0.15, rr: 0.6 },
      { dx: 0.35, dy: 0.0, rr: 0.55 },
      { dx: 0.1, dy: 0.25, rr: 0.45 },
      { dx: -0.25, dy: 0.25, rr: 0.45 },
    ];

    ctx.beginPath();
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      const bx = cx + b.dx * w;
      const by = cy + b.dy * h;
      const brx = rx * b.rr;
      const bry = ry * b.rr;
      if (i === 0) ctx.ellipse(bx, by, brx, bry, 0, 0, Math.PI * 2);
      else {
        // connect smoothly by drawing arcs then relying on fill rule
        ctx.moveTo(bx + brx, by);
        ctx.ellipse(bx, by, brx, bry, 0, 0, Math.PI * 2);
      }
    }
    if (r.fill) {
      ctx.fillStyle = r.fill;
      ctx.fill("evenodd");
    }
    ctx.stroke();
  }

  function drawCallout(ctx: CanvasRenderingContext2D, r: RectLike) {
    const radius = Math.min(Math.abs(r.w), Math.abs(r.h)) * 0.12;
    const tailW = Math.abs(r.w) * 0.22;
    const tailH = Math.abs(r.h) * 0.22;
    const tailSide = r.w >= 0 ? 1 : -1; // tail on right if drawn L->R

    const x = r.x, y = r.y, w = r.w, h = r.h;
    const x2 = x + w, y2 = y + h;

    // rounded rect
    ctx.beginPath();
    roundRectPath(ctx, x, y, w, h, radius);

    // tail (bottom-right by default)
    const tx0 = x2 - tailW * tailSide;
    const ty0 = y2 - radius * 2;
    const tipX = x2 + 0.1 * w * tailSide;
    const tipY = y2 + 0.1 * h;

    ctx.moveTo(tx0, ty0);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(x2 - radius * 2 * tailSide, y2 - radius);

    if (r.fill) {
      ctx.fillStyle = r.fill;
      ctx.fill();
    }
    ctx.stroke();
  }

  function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    const signX = Math.sign(w) || 1;
    const signY = Math.sign(h) || 1;
    const _x = x, _y = y, _w = Math.abs(w), _h = Math.abs(h);
    const left = signX > 0 ? _x : _x - _w;
    const top = signY > 0 ? _y : _y - _h;

    ctx.moveTo(left + rr, top);
    ctx.lineTo(left + _w - rr, top);
    ctx.quadraticCurveTo(left + _w, top, left + _w, top + rr);
    ctx.lineTo(left + _w, top + _h - rr);
    ctx.quadraticCurveTo(left + _w, top + _h, left + _w - rr, top + _h);
    ctx.lineTo(left + rr, top + _h);
    ctx.quadraticCurveTo(left, top + _h, left, top + _h - rr);
    ctx.lineTo(left, top + rr);
    ctx.quadraticCurveTo(left, top, left + rr, top);
  }

  function drawStarburst(ctx: CanvasRenderingContext2D, r: RectLike) {
    const spikes = 16; // change for more/less spikes
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const R = Math.hypot(r.w / 2, r.h / 2) * 0.95;
    const rInner = R * 0.45;

    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const ang = (i / (spikes * 2)) * Math.PI * 2;
      const rad = i % 2 === 0 ? R : rInner;
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (r.fill) {
      ctx.fillStyle = r.fill;
      ctx.fill();
    }
    ctx.stroke();
  }

  function drawSelection(ctx: CanvasRenderingContext2D, s: Shape) {
    ctx.save();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);

    if (isRectLike(s)) {
      ctx.strokeRect(s.x - 2, s.y - 2, s.w + 4, s.h + 4);
      for (const h of rectHandles(s)) drawHandle(ctx, h.x, h.y);
    } else if (isLineLike(s)) {
      drawHandle(ctx, s.x1, s.y1);
      drawHandle(ctx, s.x2, s.y2);
    } else if (isFreehand(s)) {
      const b = s.bbox;
      ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
      for (const h of rectHandles(b)) drawHandle(ctx, h.x, h.y);
    }
    ctx.restore();
  }

  function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const size = 6;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x - size / 2, y - size / 2, size, size);
    ctx.fill();
    ctx.stroke();
  }

  /** -------------------- Coordinate helpers -------------------- */
  function screenToWorld(pt: { x: number; y: number }) {
    const cam = cameraRef.current;
    return { x: (pt.x - cam.tx) / cam.scale, y: (pt.y - cam.ty) / cam.scale };
  }
  function worldToScreen(pt: { x: number; y: number }) {
    const cam = cameraRef.current;
    return { x: pt.x * cam.scale + cam.tx, y: pt.y * cam.scale + cam.ty };
  }
  function canvasPoint(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** -------------------- Pointer handlers -------------------- */
  function handlePointerDown(e: React.MouseEvent<HTMLCanvasElement>) {
    isPointerDownRef.current = true;
    const p = screenToWorld(canvasPoint(e));
    dragStartRef.current = p;

    if (tool === "select") {
      const hit = hitTest(p.x, p.y, shapes);
      if (hit) {
        setSelectedId(hit.shape.id);
        resizeHandleRef.current = hit.handle;
        isDraggingRef.current = true;
        draggedShapeRef.current = JSON.parse(JSON.stringify(hit.shape)) as Shape;
      } else {
        setSelectedId(null);
        resizeHandleRef.current = null;
        isDraggingRef.current = false;
        draggedShapeRef.current = null;
      }
      return;
    }

    if (tool === "text") return;

    const id = generateId();
    const stroke = "#111111";
    const strokeWidth = 2;

    if (tool === "freehand") {
      const fh: Freehand = {
        id,
        type: "freehand",
        points: [p],
        stroke,
        strokeWidth,
        bbox: { x: p.x, y: p.y, w: 0, h: 0 },
      };
      draftShapeRef.current = fh;
      requestNextFrame();
      return;
    }

    // Rect-like tools
    if (
      tool === "rect" ||
      tool === "ellipse" ||
      tool === "diamond" ||
      tool === "circle" ||
      tool === "triangle" ||
      tool === "cylinder" ||
      tool === "cloud" ||
      tool === "callout" ||
      tool === "starburst"
    ) {
      draftShapeRef.current = {
        id,
        type: tool as any,
        x: p.x,
        y: p.y,
        w: 0,
        h: 0,
        stroke,
        strokeWidth,
        fill: tool === "starburst" ? "#fff6" : undefined,
      } as RectLike;
      requestNextFrame();
      return;
    }

    // Line-like tools
    draftShapeRef.current = {
      id,
      type: tool as any,
      x1: p.x,
      y1: p.y,
      x2: p.x,
      y2: p.y,
      stroke,
      strokeWidth,
    } as LineLike;
    requestNextFrame();
  }

  function handleDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const p = screenToWorld(canvasPoint(e));
    const hit = hitTest(p.x, p.y, shapes);
    if (hit && (hit.shape as any).type === "text") {
      const t = hit.shape as TextShape;
      setSelectedId(t.id);
      setTextEditor({ visible: true, x: t.x, y: t.y, value: t.text, shapeId: t.id });
      return;
    }

    const id = generateId();
    const base: TextShape = {
      id,
      type: "text",
      x: p.x,
      y: p.y,
      w: 120,
      h: 28,
      stroke: "#000000",
      strokeWidth: 1,
      fill: "transparent",
      text: "",
      fontSize: 20,
      fontFamily: "Inter, Arial",
      color: "#111111",
    };
    setShapes((prev) => [...prev, base]);
    setSelectedId(id);
    socketRef.current?.emit("shape-create", { boardId, shape: base });
    setTextEditor({ visible: true, x: p.x, y: p.y, value: "", shapeId: id });
  }

  function handlePointerMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isPointerDownRef.current) return;
    const p = screenToWorld(canvasPoint(e));

    if (tool === "freehand" && draftShapeRef.current && isFreehand(draftShapeRef.current)) {
      const d = draftShapeRef.current as Freehand;
      d.points.push(p);
      d.bbox = computeBBox(d.points);
      requestNextFrame();
      return;
    }

    if (tool === "select" && isDraggingRef.current && draggedShapeRef.current) {
      const start = dragStartRef.current!;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      dragStartRef.current = p;

      let updated: Shape = JSON.parse(JSON.stringify(draggedShapeRef.current)) as Shape;

      if (resizeHandleRef.current) {
        // resizing
        if (isRectLike(updated)) {
          let { x, y, w, h } = updated;
          if (resizeHandleRef.current.includes("n")) {
            const newY = y + dy;
            h = h - dy;
            y = newY;
          }
          if (resizeHandleRef.current.includes("s")) h = h + dy;
          if (resizeHandleRef.current.includes("w")) {
            const newX = x + dx;
            w = w - dx;
            x = newX;
          }
          if (resizeHandleRef.current.includes("e")) w = w + dx;
          const norm = normalizeRect({ x, y, w, h });
          (updated as RectLike).x = norm.x;
          (updated as RectLike).y = norm.y;
          (updated as RectLike).w = norm.w;
          (updated as RectLike).h = norm.h;
        } else if (isLineLike(updated)) {
          if (resizeHandleRef.current === "start") {
            (updated as LineLike).x1 += dx;
            (updated as LineLike).y1 += dy;
          } else if (resizeHandleRef.current === "end") {
            (updated as LineLike).x2 += dx;
            (updated as LineLike).y2 += dy;
          }
        } else if (isFreehand(updated)) {
          // (optional) implement resize via handles if you want
        }
      } else {
        // moving
        if (isRectLike(updated)) {
          (updated as RectLike).x += dx;
          (updated as RectLike).y += dy;
        } else if (isLineLike(updated)) {
          (updated as LineLike).x1 += dx;
          (updated as LineLike).y1 += dy;
          (updated as LineLike).x2 += dx;
          (updated as LineLike).y2 += dy;
        } else if (isFreehand(updated)) {
          updated.points = updated.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
          updated.bbox = {
            x: updated.bbox.x + dx,
            y: updated.bbox.y + dy,
            w: updated.bbox.w,
            h: updated.bbox.h,
          };
        }
      }

      draggedShapeRef.current = updated;
      mutatedDuringDragRef.current = true;
      requestNextFrame();
      return;
    }

    // draft rect/line
    if (draftShapeRef.current) {
      const d = draftShapeRef.current as any;
      if (isRectLike(d)) {
        let dw = p.x - d.x;
        let dh = p.y - d.y;
        if (d.type === "circle") {
          const size = Math.max(Math.abs(dw), Math.abs(dh));
          d.w = Math.sign(dw || 1) * size;
          d.h = Math.sign(dh || 1) * size;
        } else {
          d.w = dw;
          d.h = dh;
        }
      } else if (isLineLike(d)) {
        d.x2 = p.x;
        d.y2 = p.y;
      }
      requestNextFrame();
    }
  }

  function handlePointerUp() {
    isPointerDownRef.current = false;

    // finalize freehand
    if (draftShapeRef.current && isFreehand(draftShapeRef.current)) {
      const d = draftShapeRef.current as Freehand;
      d.bbox = computeBBox(d.points);
      setShapes((prev) => [...prev, d]);
      socketRef.current?.emit("shape-create", { boardId, shape: d });
      draftShapeRef.current = null;
    }

    // finalize rect/line
    if (draftShapeRef.current && !isFreehand(draftShapeRef.current)) {
      const d = draftShapeRef.current as any;
      let toAdd: Shape = d as Shape;
      if (isRectLike(d)) {
        const norm = normalizeRect({ x: d.x, y: d.y, w: d.w, h: d.h });
        toAdd = { ...(d as RectLike), ...norm } as RectLike;
      }
      setShapes((prev) => [...prev, toAdd]);
      socketRef.current?.emit("shape-create", { boardId, shape: toAdd });
      draftShapeRef.current = null;
    }

    // end dragging
    if (isDraggingRef.current && draggedShapeRef.current && mutatedDuringDragRef.current) {
      const finalShape = draggedShapeRef.current;
      const originalShape = shapes.find((s) => s.id === finalShape.id);
      if (originalShape) {
        setShapes((prev) => prev.map((s) => (s.id === finalShape.id ? finalShape : s)));
        const diff = diffShape(originalShape, finalShape);
        if (Object.keys(diff).length > 0) {
          socketRef.current?.emit("shape-update", { boardId, shapeId: finalShape.id, props: diff });
        }
      }
    }

    isDraggingRef.current = false;
    draggedShapeRef.current = null;
    resizeHandleRef.current = null;
    dragStartRef.current = null;
    mutatedDuringDragRef.current = false;
  }

  /** -------------------- Hit test + helpers -------------------- */
  function rectHandles(s: { x: number; y: number; w: number; h: number }) {
    const x2 = s.x + s.w;
    const y2 = s.y + s.h;
    return [
      { name: "nw", x: s.x, y: s.y },
      { name: "ne", x: x2, y: s.y },
      { name: "sw", x: s.x, y: y2 },
      { name: "se", x: x2, y: y2 },
    ];
  }

  function hitTest(
    x: number,
    y: number,
    list: Shape[]
  ): { shape: Shape; handle: string | null } | null {
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (isFreehand(s)) {
        if (polylineHit(x, y, s.points, 6)) return { shape: s, handle: null };
        continue;
      }
      if (isRectLike(s)) {
        const handle = rectHandles(s).find((h) => Math.abs(h.x - x) <= 6 && Math.abs(h.y - y) <= 6);
        if (handle) return { shape: s, handle: handle.name as string } as any;
        if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return { shape: s, handle: null };
      } else {
        const l = s as LineLike;
        // endpoints
        if (distance(x, y, l.x1, l.y1) <= 6) return { shape: s, handle: "start" } as any;
        if (distance(x, y, l.x2, l.y2) <= 6) return { shape: s, handle: "end" } as any;

        if (l.type === "orthogonal") {
          const bend = { x: l.x2, y: l.y1 };
          if (pointToSegmentDistance(x, y, l.x1, l.y1, bend.x, bend.y) < 6) return { shape: s, handle: null };
          if (pointToSegmentDistance(x, y, bend.x, bend.y, l.x2, l.y2) < 6) return { shape: s, handle: null };
        } else {
          if (pointToSegmentDistance(x, y, l.x1, l.y1, l.x2, l.y2) < 6) return { shape: s, handle: null };
        }
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
  function polylineHit(x: number, y: number, pts: { x: number; y: number }[], tol: number) {
    for (let i = 1; i < pts.length; i++) {
      if (pointToSegmentDistance(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= tol) return true;
    }
    return false;
  }

  function computeBBox(pts: { x: number; y: number }[]) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
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

  function requestNextFrame() {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(() => renderCanvas());
  }

  /** -------------------- Clipboard + keyboard -------------------- */
  function cloneForPaste(s: Shape): Shape {
    const id = generateId();
    const offset = 16;
    if (isRectLike(s)) {
      const base = s as RectLike | TextShape;
      return { ...base, id, x: base.x + offset, y: base.y + offset } as Shape;
    } else if (isLineLike(s)) {
      const l = s as LineLike;
      return { ...l, id, x1: l.x1 + offset, y1: l.y1 + offset, x2: l.x2 + offset, y2: l.y2 + offset } as Shape;
    } else {
      const f = s as Freehand;
      const pts = f.points.map((p) => ({ x: p.x + offset, y: p.y + offset }));
      const b = computeBBox(pts);
      return { ...f, id, points: pts, bbox: b } as Shape;
    }
  }
  function copySelected() {
    const selId = selectedIdRef.current;
    if (!selId) return;
    const s = shapesRef.current.find((sh) => sh.id === selId);
    if (!s) return;
    clipboardRef.current = JSON.parse(JSON.stringify(s));
  }
  function cutSelected() {
    copySelected();
    deleteSelected();
  }
  function pasteClipboard() {
    const clip = clipboardRef.current;
    if (!clip) return;
    const pasted = cloneForPaste(clip);
    setShapes((prev) => [...prev, pasted]);
    setSelectedId(pasted.id);
    socketRef.current?.emit("shape-create", { boardId, shape: pasted });
  }
  function deleteSelected() {
    const selId = selectedIdRef.current;
    if (!selId) return;
    isDraggingRef.current = false;
    draggedShapeRef.current = null;
    setShapes((prev) => prev.filter((s) => s.id !== selId));
    setSelectedId(null);
    socketRef.current?.emit("shape-delete", { boardId, shapeId: selId });
  }

  useEffect(() => {
    const isTypingTarget = () => {
      const el = document.activeElement as HTMLElement | null;
      return (
        textEditor.visible ||
        (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as any).isContentEditable))
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget()) return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIdRef.current) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }
      if (mod && key === "c") {
        if (selectedIdRef.current) {
          e.preventDefault();
          copySelected();
        }
        return;
      }
      if (mod && key === "x") {
        if (selectedIdRef.current) {
          e.preventDefault();
          cutSelected();
        }
        return;
      }
      if (mod && key === "v") {
        e.preventDefault();
        pasteClipboard();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [textEditor.visible]);

  /** -------------------- Pan / Zoom (infinite canvas) -------------------- */
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // Allow smooth trackpad pan with two fingers, and pinch-zoom (ctrlKey true on macOS)
      e.preventDefault();

      const cam = cameraRef.current;

      if (e.ctrlKey) {
        // zoom around cursor
        const rect = (canvasRef.current as HTMLCanvasElement).getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldBefore = screenToWorld({ x: screenX, y: screenY });

        const zoomIntensity = 0.0015;
        const newScale = clamp(cam.scale * (1 - e.deltaY * zoomIntensity), 0.25, 3);

        cam.scale = newScale;

        // keep cursor anchored
        cam.tx = screenX - worldBefore.x * newScale;
        cam.ty = screenY - worldBefore.y * newScale;
      } else {
        // pan
        cam.tx -= e.deltaX;
        cam.ty -= e.deltaY;
      }

      setViewVersion((v) => v + 1); // re-position text editor overlay
      requestNextFrame();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel as any);
  }, []);

  function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
  }

  /** -------------------- UI -------------------- */
  const palette = ["#111111", "#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#000000", "#FFFFFF"];

  // keep canvas size in sync with viewport
  useEffect(() => {
    const onResize = () => {
      if (!canvasRef.current) return;
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight - 110;
      renderCanvas();
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div
       className="flex justify-between py-2 px-5 bg-green-200"
      >
        <button onClick={() => navigate("/boards")} style={{ cursor: "pointer" }}>
          ← Back
        </button>
          
          <div  className="bg-blue-100 py-1 px-3 rounded-md" >
            {([
              ["select", "Select"],
              ["rect", "□"],
              ["ellipse", "◯"],
              ["circle", "●"],
              ["diamond", "◇"],
              ["triangle", "△"],
              ["line", "─"],
              ["arrow", "→"],
              ["arrowDouble", "⇄"],
              ["orthogonal", "└"],
              ["cylinder", "DB"],
              ["cloud", "☁︎"],
              ["callout", "💬"],
              ["starburst", "✷"],
              ["text", "T"],
              ["freehand", "✎"],
            ] as [Tool, string][]).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTool(t)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: tool === t ? "#eff6ff" : "transparent",
                  cursor: "pointer",
                }}
                title={t}
              >
                {label}
              </button>
            ))}
          </div>
        <input
          value={boardName}
          onChange={(e) => setBoardName(e.target.value)}
          placeholder="Untitled document"
          style={{ border: "none", fontSize: 16, textAlign: "right", outline: "none" }}
        />
      </div>

      {/* Inspector */}
      {selectedId &&
        (() => {
          const sel = shapes.find((s) => s.id === selectedId);
          if (!sel) return null;
          const updateSel = (props: Partial<Shape>) => {
            setShapes((prev) => prev.map((s) => (s.id === selectedId ? ({ ...s, ...props } as Shape) : s)));
            socketRef.current?.emit("shape-update", { boardId, shapeId: selectedId, props });
          };
          return (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: 8,
                borderBottom: "1px dashed #cbd5e1",
                flexWrap: "wrap",
                background: "#fff",
              }}
            >
              <span style={{ opacity: 0.7 }}>Selected: {(sel as any).type}</span>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>Width</span>
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={(sel as any).strokeWidth || 2}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 1;
                    updateSel({ strokeWidth: v } as any);
                  }}
                  style={{ width: 64 }}
                />
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {palette.map((c) => (
                  <button
                    key={c}
                    title={c}
                    onClick={() => {
                      if ((sel as any).type === "text") updateSel({ color: c } as any);
                      else if (isRectLike(sel)) updateSel({ fill: c } as any);
                      else updateSel({ stroke: c } as any);
                    }}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: "1px solid #e5e5e5",
                      background: c,
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })()}

      {/* Canvas + Guide */}
      <div ref={wrapperRef} style={{ position: "relative", flex: 1, background: GRID_BG }}>
        <canvas
          ref={canvasRef}
          width={window.innerWidth}
          height={window.innerHeight - 110}
          onMouseDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            cursor: tool === "select" ? "default" : tool === "freehand" ? "crosshair" : "crosshair",
            background: "transparent",
          }}
        />

        {textEditor.visible && (() => {
          const scr = worldToScreen({ x: textEditor.x, y: textEditor.y });
          return (
            <textarea
              autoFocus
              value={textEditor.value}
              onChange={(e) => setTextEditor((t) => ({ ...t, value: e.target.value }))}
              onBlur={() => finalizeTextEditor()}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  finalizeTextEditor();
                }
              }}
              style={{
                position: "absolute",
                left: scr.x,
                top: scr.y,
                width: 240,
                height: 60,
                border: "1px solid #3b82f6",
                borderRadius: 6,
                padding: 6,
                background: "#fff",
                outline: "none",
              }}
            />
          );
        })()}

        {/* helper card */}
        {/* <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            padding: "10px 12px",
            background: "#fff",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            color: "#334155",
            fontSize: 13,
            lineHeight: 1.3,
          }}
        >
          <b style={{ display: "block", marginBottom: 6 }}>Guide</b>
          <div>• Pick a tool on the toolbar</div>
          <div>• Drag to draw / move</div>
          <div>• Two-finger scroll to pan</div>
          <div>• Pinch to zoom</div>
          <div>• ⌘/Ctrl+C/X/V, ⌫ to edit</div>
          <div>• Double-click to add text</div>
        </div> */}
      </div>
    </div>
  );

  /** -------------------- Text editor finalize -------------------- */
  function finalizeTextEditor() {
    if (!textEditor.visible) return;
    const shape = shapes.find((s) => s.id === textEditor.shapeId) as TextShape | undefined;
    if (!shape) {
      setTextEditor({ visible: false, x: 0, y: 0, value: "", shapeId: null });
      return;
    }

    const value = textEditor.value;
    if (!value.trim()) {
      const nextList = shapes.filter((s) => s.id !== shape.id);
      setShapes(nextList);
      socketRef.current?.emit("shape-delete", { boardId, shapeId: shape.id });
      setTextEditor({ visible: false, x: 0, y: 0, value: "", shapeId: null });
      return;
    }

    const dim = measureText(value, shape.fontSize, shape.fontFamily);
    const next: TextShape = { ...shape, text: value, w: dim.width, h: dim.height };
    setShapes((prev) => prev.map((s) => (s.id === shape.id ? next : s)));
    socketRef.current?.emit("shape-update", {
      boardId,
      shapeId: shape.id,
      props: { text: next.text, w: next.w, h: next.h },
    });
    setTextEditor({ visible: false, x: 0, y: 0, value: "", shapeId: null });
  }
}
