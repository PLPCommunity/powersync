// src/components/BoardCanvas.tsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { auth } from "../utils/firebase";

/* -------------------- Types -------------------- */
type ShapeType =
  | "rect" | "ellipse" | "diamond" | "circle" | "triangle"
  | "line" | "arrow" | "arrowDouble" | "orthogonal"
  | "text" | "freehand" | "cylinder" | "cloud" | "callout" | "starburst";
type Tool = "select" | ShapeType;
type CollaboratorRole = "editor" | "viewer";
type Collaborator = {
  email: string;
  uid?: string;
  role: CollaboratorRole;
  invitedAt?: string;
  acceptedAt?: string;
  status?: "invited" | "accepted";
};

type PublicAccess = {
  enabled: boolean;
  role: CollaboratorRole;
  linkId?: string;
};

type RectLike = {
  id: string;
  type: "rect" | "ellipse" | "diamond" | "circle" | "triangle" | "text" | "cylinder" | "cloud" | "callout" | "starburst";
  x: number; y: number; w: number; h: number;
  stroke: string; fill?: string; strokeWidth: number; rotation?: number;
};
type LineLike = {
  id: string; type: "line" | "arrow" | "arrowDouble" | "orthogonal";
  x1: number; y1: number; x2: number; y2: number;
  stroke: string; strokeWidth: number;
};
type TextShape = RectLike & { type: "text"; text: string; fontSize: number; fontFamily: string; color: string; };
type Freehand = { id: string; type: "freehand"; points: { x: number; y: number }[]; stroke: string; strokeWidth: number; bbox: { x: number; y: number; w: number; h: number } };
type Shape = RectLike | LineLike | TextShape | Freehand;

/* -------------------- Config / utils -------------------- */
const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:5000";
const GRID_SIZE = 24; const GRID_BG = "#fbfbfd"; const GRID_LINE = "#eef1f5"; const GRID_BOLD = "#e5e9f0";
const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function measureText(text: string, fontSize: number, fontFamily: string) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${fontSize}px ${fontFamily}`;
  const m = ctx.measureText(text || "");
  return { width: Math.ceil(m.width) + 12, height: Math.ceil(fontSize * 1.4) + 8 };
}

const isRectLike = (s: Shape): s is RectLike =>
  ["rect","ellipse","diamond","circle","triangle","text","cylinder","cloud","callout","starburst"].includes((s as any).type);
const isLineLike = (s: Shape): s is LineLike =>
  ["line","arrow","arrowDouble","orthogonal"].includes((s as any).type);
const isFreehand = (s: Shape): s is Freehand => (s as any).type === "freehand";

const degToRad = (d: number) => (d * Math.PI) / 180;
const radToDeg = (r: number) => (r * 180) / Math.PI;
const getRotation = (s: { rotation?: number }) => degToRad(s.rotation ?? 0);
const getRectCenter = (s: { x: number; y: number; w: number; h: number }) => ({ cx: s.x + s.w / 2, cy: s.y + s.h / 2 });
function rotatePoint(cx:number, cy:number, x:number, y:number, rad:number){ const dx=x-cx, dy=y-cy, cos=Math.cos(rad), sin=Math.sin(rad); return { x: cx + dx*cos - dy*sin, y: cy + dx*sin + dy*cos }; }
function toLocalOfRect(s:{x:number;y:number;w:number;h:number;rotation?:number}, x:number, y:number){
  const {cx,cy}=getRectCenter(s); const rad=getRotation(s); const dx=x-cx, dy=y-cy; const cos=Math.cos(rad), sin=Math.sin(rad);
  const lx=dx*cos+dy*sin, ly=-dx*sin+dy*cos; const halfW=Math.abs(s.w)/2, halfH=Math.abs(s.h)/2;
  return { lx, ly, halfW, halfH };
}
function nearlyZeroRotation(s:{rotation?:number}){ const a=((s.rotation ?? 0)%360+360)%360; return a<0.5 || Math.abs(a-360)<0.5; }
type HandlePoint = { name:"nw"|"ne"|"sw"|"se"|"rotate"; x:number; y:number; };
function rectHandlesRotated(s: RectLike): HandlePoint[] {
  const rad=getRotation(s); const {cx,cy}=getRectCenter(s);
  const corners: HandlePoint[] = ([
    {name:"nw" as const, x:s.x,          y:s.y},
    {name:"ne" as const, x:s.x + s.w,    y:s.y},
    {name:"sw" as const, x:s.x,          y:s.y + s.h},
    {name:"se" as const, x:s.x + s.w,    y:s.y + s.h},
  ]).map(({name,x,y})=>({name, ...rotatePoint(cx,cy,x,y,rad)}));
  const halfH = Math.abs(s.h)/2, offset=24;
  const rx=cx + Math.sin(rad)*(halfH+offset), ry=cy - Math.cos(rad)*(halfH+offset);
  return [...corners, { name:"rotate", x:rx, y:ry }];
}

/* -------------------- Component -------------------- */
export function BoardCanvas() {
  
  const { id: boardId } = useParams();
  const navigate = useNavigate();
  
  const [boardName, setBoardName] = useState("Untitled document");
  const [tool, setTool] = useState<Tool | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false); // <-- gate autosaves until data is fetched
  const [loading, setLoading] = useState(true); // <-- track initial loading state
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(true); // <-- control loading overlay separately
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [publicAccess, setPublicAccess] = useState<PublicAccess>({ enabled: false, role: "viewer" });
  const [shareOpen, setShareOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>("viewer");
  const [canEdit, setCanEdit] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isPublic, setIsPublic] = useState(false); // Will be set based on board data
  const [userRole, setUserRole] = useState<'owner' | 'editor' | 'viewer'>('viewer');

  // Track last server-synced state to avoid unnecessary PUTs and to detect "dirty"
  const serverNameRef = useRef<string>("Untitled document");
  const lastSavedShapesRef = useRef<string>("[]"); // JSON string snapshot

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
  const rotateRef = useRef<{ cx: number; cy: number; startAngle: number; initialDeg: number } | null>(null);

  // Camera
  const cameraRef = useRef<{ tx: number; ty: number; scale: number }>({ tx: 0, ty: 0, scale: 1 });
  const [viewVersion, setViewVersion] = useState(0);

  // Text overlay
  const [textEditor, setTextEditor] = useState<{visible:boolean; x:number; y:number; value:string; shapeId:string|null}>({ visible:false, x:0, y:0, value:"", shapeId:null });

  // mirrors for stable handlers
  const clipboardRef = useRef<Shape | null>(null);
  const shapesRef = useRef<Shape[]>([]); useEffect(()=>{shapesRef.current = shapes;},[shapes]);
  const selectedIdRef = useRef<string | null>(null); useEffect(()=>{selectedIdRef.current = selectedId;},[selectedId]);

  /* -------------------- Auth: ensure cookie -------------------- */
  async function ensureSession() {
    const u = auth.currentUser;
    if (!u) return false;
    try {
      const idToken = await u.getIdToken(true);
      const r = await fetch(`${API_BASE}/api/sessionLogin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken }),
      });
      return r.ok;
    } catch { return false; }
  }

  /* -------------------- Fetch board (safe) -------------------- */
  const loadingRef = useRef(false);
  async function fetchBoard(force = false) {
    if (loadingRef.current) return;
    const isDirty =
      boardName.trim() !== serverNameRef.current.trim() ||
      JSON.stringify(shapes) !== lastSavedShapesRef.current;

    // Avoid clobbering local edits; only refresh when not dirty (unless forced)
    if (!force && isDirty) return;

    loadingRef.current = true;
    try {
      const endpoint = `/api/boards/${boardId}`;
      console.log('[Board] Fetching from:', endpoint);
      
      // Try to ensure session if user is authenticated (but don't block on it)
      const u = auth.currentUser;
      if (u) {
        try {
          await ensureSession();
        } catch (error) {
          console.log('[Board] Session setup failed, continuing anyway:', error);
        }
      }
      
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "GET",
        credentials: "include",
      });
      
      if (!res.ok) {
        // If 404, board doesn't exist - redirect to boards
        if (res.status === 404) {
          console.log('[Board] Board not found, redirecting to boards');
          navigate("/boards");
          return;
        }
        // If 403, user doesn't have access to private board - redirect to boards
        if (res.status === 403) {
          console.log('[Board] Access denied to private board, redirecting to boards');
          navigate("/boards");
          return;
        }
        // For other errors, just show error and don't redirect
        console.error('[Board] Failed to fetch:', res.status, res.statusText);
        setLoading(false);
        return;
      }
      
      const data = await res.json();
      console.log('[Board] Received data:', data);

      // Update local state with server data
      const nextName = data?.name || "Untitled document";
      const nextShapes: Shape[] = Array.isArray(data?.shapes) ? data.shapes : [];
      const nextCollabs: Collaborator[] = Array.isArray(data?.collaborators) ? data.collaborators : [];
      const nextPublicAccess: PublicAccess = data?.publicAccess || { enabled: false, role: "viewer" };

      serverNameRef.current = nextName;
      lastSavedShapesRef.current = JSON.stringify(nextShapes);

      setBoardName(nextName);
      setShapes(nextShapes);
      setCollaborators(nextCollabs);
      setPublicAccess(nextPublicAccess);
      
      // Set user role and permissions based on server response
      const serverUserRole = data?.userRole || 'viewer';
      setUserRole(serverUserRole);
      
      // Check if this is a public board
      const isPublicBoard = data?.isPublic || false;
      setIsPublic(isPublicBoard);
      
      // Set permissions based on user role
      const amOwner = serverUserRole === 'owner';
      setIsOwner(amOwner);
      setCanEdit(amOwner || serverUserRole === 'editor');
      
      console.log('[Board] User permissions:', { 
        userRole: serverUserRole, 
        isOwner: amOwner, 
        canEdit: amOwner || serverUserRole === 'editor',
        isPublic: isPublicBoard
      });
      
      setLoaded(true); // <-- allow autosaves after first load
      setLoading(false); // <-- mark initial loading as complete
      
      // Hide loading overlay quickly for better UX
      setTimeout(() => setShowLoadingOverlay(false), 100);
    } catch (error) {
      console.error('[Board] Error fetching board:', error);
      setLoading(false);
      setShowLoadingOverlay(false);
    } finally {
      loadingRef.current = false;
    }
  }

  /* -------------------- Init / sockets / first load -------------------- */
  useEffect(() => {
    let mounted = true;
    console.log('[Board] Initializing BoardCanvas for board:', boardId);
    
    socketRef.current = io(API_BASE, { transports: ["websocket"] });

    let unsub: (() => void) | undefined;
    
    // Always try to fetch the board first
    fetchBoard(true);
    
    // Start rendering immediately for better perceived performance
    requestNextFrame();
    
    // Set up auth listener 
    unsub = auth.onAuthStateChanged(async (u: any) => {
      if (!mounted) return;
      
      console.log('[Board] Auth state changed:', u ? 'User authenticated' : 'No user');
      
      if (u) {
        // User is authenticated - try to accept any invitation
        console.log('[Board] User authenticated, trying to accept invitation');
        try {
          await fetch(`${API_BASE}/api/boards/${boardId}/accept`, { 
            method: "POST", 
            credentials: "include" 
          });
        } catch (error) {
          console.log('[Board] Failed to accept board invitation:', error);
        }
        
        // Join the board socket room
        if (boardId) {
          socketRef.current?.emit("join-board", { 
            boardId: boardId, 
            userId: u.uid, 
            userName: u.displayName 
          });
        }
        
        // Refresh board data now that user is authenticated
        if (loaded) {
          fetchBoard(true);
        }
      }
    });
    
    // refresh when focus returns (if not dirty) + background poll
    const onFocus = () => fetchBoard(false);
    const id = window.setInterval(() => fetchBoard(false), 30000);

    window.addEventListener("focus", onFocus);
    return () => {
      console.log('[Board] Cleaning up BoardCanvas');
      mounted = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
      unsub?.();
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, [boardId, navigate]);

  /* -------------------- Socket shape events (peer updates) -------------------- */
  useEffect(() => {
    const onCreated = (payload: { shape: Shape }) => {
      setShapes((prev) => [...prev.filter((s) => s.id !== payload.shape.id), payload.shape]);
    };
    const onUpdated = (payload: { shapeId: string; props: Partial<Shape> }) => {
      setShapes((prev) => prev.map((s) => (s.id === payload.shapeId ? ({ ...s, ...(payload.props as any) } as Shape) : s)));
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

  /* -------------------- Autosave (shapes) -------------------- */
  useEffect(() => {
    if (!loaded || !boardId || !canEdit) return; // don't save before first fetch, or if no boardId, or if user can't edit
    const current = JSON.stringify(shapes);
    if (current === lastSavedShapesRef.current) return; // unchanged

    const t = setTimeout(async () => {
      try {
        // Ensure session before autosaving
        const u = auth.currentUser;
        if (u) {
          await ensureSession();
        }
        
        const r = await fetch(`${API_BASE}/api/boards/${boardId}/shapes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ shapes }),
        });
        if (r.status === 401) { 
          // Don't redirect immediately, just log the issue
          console.log('[Board] Autosave failed - unauthorized, will retry later');
          return; 
        }
        if (r.ok) {
          lastSavedShapesRef.current = current; // synced
        }
      } catch {/* ignore */}
    }, 100); // Reduced to 100ms for near-instant sync
    return () => clearTimeout(t);
  }, [shapes, boardId, loaded, navigate, canEdit]);

  /* -------------------- Autosave (name) -------------------- */
  useEffect(() => {
    if (!loaded || !boardId || !canEdit) return;
    const trimmed = boardName.trim();
    if (trimmed === serverNameRef.current.trim()) return;

    const t = setTimeout(async () => {
      try {
        // Ensure session before autosaving
        const u = auth.currentUser;
        if (u) {
          await ensureSession();
        }
        
        const r = await fetch(`${API_BASE}/api/boards/${boardId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: trimmed || "Untitled document" }),
        });
        if (r.status === 401) { 
          // Don't redirect immediately, just log the issue
          console.log('[Board] Name autosave failed - unauthorized, will retry later');
          return; 
        }
        if (r.ok) {
          serverNameRef.current = trimmed || "Untitled document";
        }
      } catch {/* ignore */}
    }, 200); // Reduced to 200ms for faster sync
    return () => clearTimeout(t);
  }, [boardName, boardId, loaded, navigate, canEdit]);

  /* -------------------- Render loop -------------------- */
  const requestNextFrame = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(renderCanvas);
  };
  
  // Optimize render triggers - render immediately when loaded, don't wait for all dependencies
  useEffect(() => { 
    if (loaded || shapes.length > 0) {
      requestNextFrame(); 
    }
  }, [shapes, selectedId, tool, viewVersion, loaded]);

  function renderCanvas() {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const { width, height } = canvas; const cam = cameraRef.current;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = GRID_BG; ctx.fillRect(0,0,width,height);
    drawGrid(ctx,width,height,cam);
    ctx.setTransform(cam.scale,0,0,cam.scale,cam.tx,cam.ty);
    for (const shape of shapes) {
      if (isDraggingRef.current && draggedShapeRef.current?.id === shape.id) {
        drawShape(ctx, draggedShapeRef.current!);
        if (selectedId === shape.id) drawSelection(ctx, draggedShapeRef.current!);
      } else {
        drawShape(ctx, shape);
        if (selectedId === shape.id) drawSelection(ctx, shape);
      }
    }
    if (draftShapeRef.current) { ctx.save(); ctx.globalAlpha = 0.7; drawShape(ctx, draftShapeRef.current); ctx.restore(); }
  }

  function drawGrid(ctx:CanvasRenderingContext2D,w:number,h:number,cam:{tx:number;ty:number;scale:number}){
    const s=cam.scale;
    const leftW=-cam.tx/s, topW=-cam.ty/s, rightW=leftW + w/s, bottomW=topW + h/s;
    const xStart=Math.floor(leftW/GRID_SIZE)*GRID_SIZE, xEnd=Math.ceil(rightW/GRID_SIZE)*GRID_SIZE;
    const yStart=Math.floor(topW/GRID_SIZE)*GRID_SIZE, yEnd=Math.ceil(bottomW/GRID_SIZE)*GRID_SIZE;
    ctx.beginPath();
    for (let x=xStart; x<=xEnd; x+=GRID_SIZE){ const sx=x*s+cam.tx; ctx.moveTo(sx+0.5,0); ctx.lineTo(sx+0.5,h); }
    for (let y=yStart; y<=yEnd; y+=GRID_SIZE){ const sy=y*s+cam.ty; ctx.moveTo(0,sy+0.5); ctx.lineTo(w,sy+0.5); }
    ctx.strokeStyle=GRID_LINE; ctx.lineWidth=1; ctx.stroke();
    ctx.beginPath();
    for (let x=xStart; x<=xEnd; x+=GRID_SIZE*5){ const sx=x*s+cam.tx; ctx.moveTo(sx+0.5,0); ctx.lineTo(sx+0.5,h); }
    for (let y=yStart; y<=yEnd; y+=GRID_SIZE*5){ const sy=y*s+cam.ty; ctx.moveTo(0,sy+0.5); ctx.lineTo(w,sy+0.5); }
    ctx.strokeStyle=GRID_BOLD; ctx.lineWidth=1; ctx.stroke();
  }

  /* -------------------- Drawing primitives -------------------- */
  function drawShape(ctx:CanvasRenderingContext2D,s:Shape){
    ctx.lineWidth=(s as any).strokeWidth || 2; ctx.strokeStyle=(s as any).stroke || "#111";
    if (isFreehand(s)) {
      ctx.beginPath(); if (!s.points.length) return;
      ctx.moveTo(s.points[0].x, s.points[0].y); for (let i=1;i<s.points.length;i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke(); return;
    }
    if (isRectLike(s)) {
      const rad=getRotation(s); const {cx,cy}=getRectCenter(s); ctx.save(); ctx.translate(cx,cy); if (rad) ctx.rotate(rad);
      const lx=s.x-cx, ly=s.y-cy;
      if (s.type==="rect"){ if (s.fill){ctx.fillStyle=s.fill; ctx.fillRect(lx,ly,s.w,s.h);} ctx.strokeRect(lx,ly,s.w,s.h); ctx.restore(); return; }
      if (s.type==="ellipse" || s.type==="circle"){
        ctx.beginPath();
        const rx=s.type==="circle" ? Math.max(Math.abs(s.w/2), Math.abs(s.h/2)) : Math.abs(s.w/2);
        const ry=s.type==="circle" ? rx : Math.abs(s.h/2);
        ctx.ellipse(lx + s.w/2, ly + s.h/2, rx, ry, 0, 0, Math.PI*2);
        if (s.fill){ctx.fillStyle=s.fill; ctx.fill();} ctx.stroke(); ctx.restore(); return;
      }
      if (s.type==="triangle"){
        const x2=lx+s.w, y2=ly+s.h;
        ctx.beginPath(); ctx.moveTo(lx+s.w/2, ly); ctx.lineTo(lx, y2); ctx.lineTo(x2, y2); ctx.closePath();
        if (s.fill){ctx.fillStyle=s.fill; ctx.fill();} ctx.stroke(); ctx.restore(); return;
      }
      if (s.type==="diamond"){
        const cxL=lx+s.w/2, cyL=ly+s.h/2;
        ctx.beginPath(); ctx.moveTo(cxL, ly); ctx.lineTo(lx+s.w, cyL); ctx.lineTo(cxL, ly+s.h); ctx.lineTo(lx, cyL); ctx.closePath();
        if (s.fill){ctx.fillStyle=s.fill; ctx.fill();} ctx.stroke(); ctx.restore(); return;
      }
      if (s.type==="cylinder"){ drawCylinder(ctx,{...s,x:lx,y:ly}); ctx.restore(); return; }
      if (s.type==="cloud"){ drawCloud(ctx,{...s,x:lx,y:ly}); ctx.restore(); return; }
      if (s.type==="callout"){ drawCallout(ctx,{...s,x:lx,y:ly}); ctx.restore(); return; }
      if (s.type==="starburst"){ drawStarburst(ctx,{...s,x:lx,y:ly}); ctx.restore(); return; }
      if (s.type==="text"){
        const t=s as TextShape;
        ctx.font = `${t.fontSize}px ${t.fontFamily}`; ctx.textBaseline="top";
        if (t.fill && t.fill!=="transparent"){ ctx.fillStyle=t.fill; ctx.fillRect(lx,ly,t.w||0,t.h||t.fontSize*1.4); }
        ctx.fillStyle=t.color || "#111"; ctx.fillText(t.text||"", lx, ly); ctx.restore(); return;
      }
      ctx.restore(); return;
    }
    // lines
    const l=s as LineLike;
    if (l.type==="orthogonal"){
      const bend={x:l.x2,y:l.y1}; ctx.beginPath(); ctx.moveTo(l.x1,l.y1); ctx.lineTo(bend.x,bend.y); ctx.lineTo(l.x2,l.y2); ctx.stroke(); return;
    }
    ctx.beginPath(); ctx.moveTo(l.x1,l.y1); ctx.lineTo(l.x2,l.y2); ctx.stroke();
    if (l.type==="arrow" || l.type==="arrowDouble") {
      drawArrowHead(ctx,l.x1,l.y1,l.x2,l.y2,(l as any).strokeWidth||2);
      if (l.type==="arrowDouble") drawArrowHead(ctx,l.x2,l.y2,l.x1,l.y1,(l as any).strokeWidth||2);
    }
  }
  function drawArrowHead(ctx:CanvasRenderingContext2D,x1:number,y1:number,x2:number,y2:number,width:number){
    const angle=Math.atan2(y2-y1,x2-x1), size=10+width;
    ctx.beginPath();
    ctx.moveTo(x2,y2);
    ctx.lineTo(x2 - size*Math.cos(angle-Math.PI/6), y2 - size*Math.sin(angle-Math.PI/6));
    ctx.moveTo(x2,y2);
    ctx.lineTo(x2 - size*Math.cos(angle+Math.PI/6), y2 - size*Math.sin(angle+Math.PI/6));
    ctx.stroke();
  }
  function drawCylinder(ctx:CanvasRenderingContext2D,r:RectLike){
    const {x,y,w,h}=r, rx=Math.abs(w/2), ry=Math.abs(Math.min(h/6, Math.abs(w)/4)), cx=x+w/2;
    if (r.fill){ctx.fillStyle=r.fill; ctx.fillRect(x,y+ry,w,h-2*ry);} ctx.strokeRect(x,y+ry,w,h-2*ry);
    ctx.beginPath(); ctx.ellipse(cx,y+ry,rx,ry,0,0,Math.PI*2); if (r.fill){ctx.fillStyle=r.fill; ctx.fill();} ctx.stroke();
    ctx.save(); ctx.setLineDash([6,4]); ctx.beginPath(); ctx.ellipse(cx,y+h-ry,rx,ry,0,Math.PI,0,true); ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.ellipse(cx,y+h-ry,rx,ry,0,0,Math.PI); ctx.stroke();
  }
  function drawCloud(ctx:CanvasRenderingContext2D,r:RectLike){
    const {x,y,w,h}=r, cx=x+w/2, cy=y+h/2, rx=Math.abs(w/2), ry=Math.abs(h/2);
    const blobs=[{dx:-0.35,dy:0.1,rr:0.5},{dx:-0.05,dy:-0.15,rr:0.6},{dx:0.35,dy:0.0,rr:0.55},{dx:0.1,dy:0.25,rr:0.45},{dx:-0.25,dy:0.25,rr:0.45}];
    ctx.beginPath();
    blobs.forEach((b,i)=>{ const bx=cx+b.dx*w, by=cy+b.dy*h, brx=rx*b.rr, bry=ry*b.rr;
      if (i===0) ctx.ellipse(bx,by,brx,bry,0,0,Math.PI*2);
      else { ctx.moveTo(bx+brx,by); ctx.ellipse(bx,by,brx,bry,0,0,Math.PI*2); }
    });
    if (r.fill){ctx.fillStyle=r.fill; ctx.fill("evenodd");} ctx.stroke();
  }
  function drawCallout(ctx:CanvasRenderingContext2D,r:RectLike){
    const radius=Math.min(Math.abs(r.w),Math.abs(r.h))*0.12;
    const tailW=Math.abs(r.w)*0.22, tailSide=r.w>=0?1:-1;
    const x=r.x,y=r.y,w=r.w,h=r.h,x2=x+w,y2=y+h;
    ctx.beginPath();
    roundRectPath(ctx,x,y,w,h,radius);
    const tx0=x2 - tailW*tailSide, ty0=y2 - radius*2, tipX=x2 + 0.1*w*tailSide, tipY=y2 + 0.1*h;
    ctx.moveTo(tx0,ty0); ctx.lineTo(tipX,tipY); ctx.lineTo(x2 - radius*2*tailSide, y2 - radius);
    if (r.fill){ctx.fillStyle=r.fill; ctx.fill();} ctx.stroke();
  }
  function roundRectPath(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
    const rr=Math.min(r, Math.abs(w)/2, Math.abs(h)/2); const _w=Math.abs(w), _h=Math.abs(h);
    const left = w>=0 ? x : x - _w; const top = h>=0 ? y : y - _h;
    ctx.moveTo(left+rr,top); ctx.lineTo(left+_w-rr,top); ctx.quadraticCurveTo(left+_w,top,left+_w,top+rr);
    ctx.lineTo(left+_w, top+_h-rr); ctx.quadraticCurveTo(left+_w, top+_h, left+_w-rr, top+_h);
    ctx.lineTo(left+rr, top+_h); ctx.quadraticCurveTo(left, top+_h, left, top+_h-rr);
    ctx.lineTo(left, top+rr); ctx.quadraticCurveTo(left, top, left+rr, top);
  }
  function drawStarburst(ctx:CanvasRenderingContext2D,r:RectLike){
    const spikes=16, cx=r.x+r.w/2, cy=r.y+r.h/2, R=Math.hypot(r.w/2,r.h/2)*0.95, rInner=R*0.45;
    ctx.beginPath();
    for (let i=0;i<spikes*2;i++){ const ang=(i/(spikes*2))*Math.PI*2, rad=i%2===0?R:rInner;
      const px=cx+Math.cos(ang)*rad, py=cy+Math.sin(ang)*rad;
      if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath(); if (r.fill){ctx.fillStyle=r.fill; ctx.fill();} ctx.stroke();
  }
  function drawSelection(ctx:CanvasRenderingContext2D,s:Shape){
    ctx.save(); ctx.strokeStyle="#3b82f6"; ctx.lineWidth=1; ctx.setLineDash([6,4]);
    if (isRectLike(s)) {
      const rad=getRotation(s); const {cx,cy}=getRectCenter(s); const lx=s.x-cx, ly=s.y-cy;
      ctx.translate(cx,cy); if (rad) ctx.rotate(rad);
      ctx.strokeRect(lx-2,ly-2,s.w+4,s.h+4);
      ctx.setLineDash([]);
      if (nearlyZeroRotation(s)) {
        const corners=[{x:s.x,y:s.y},{x:s.x+s.w,y:s.y},{x:s.x,y:s.y+s.h},{x:s.x+s.w,y:s.y+s.h}];
        for (const c of corners) drawHandle(ctx, c.x-cx, c.y-cy);
      }
      const halfH=Math.abs(s.h)/2, offset=24;
      ctx.beginPath(); ctx.moveTo(0,-halfH); ctx.lineTo(0,-halfH - offset); ctx.stroke();
      drawRotateHandle(ctx, 0, -halfH - offset);
      ctx.restore();
    } else if (isLineLike(s)) {
      const l=s as LineLike; drawHandle(ctx,l.x1,l.y1); drawHandle(ctx,l.x2,l.y2);
    } else if (isFreehand(s)) {
      const b=(s as Freehand).bbox; ctx.strokeRect(b.x-2,b.y-2,b.w+4,b.h+4);
    }
    ctx.restore();
  }
  function drawHandle(ctx:CanvasRenderingContext2D,x:number,y:number){ const size=6; ctx.fillStyle="#fff"; ctx.strokeStyle="#3b82f6"; ctx.lineWidth=1; ctx.beginPath(); ctx.rect(x-size/2,y-size/2,size,size); ctx.fill(); ctx.stroke(); }
  function drawRotateHandle(ctx:CanvasRenderingContext2D,x:number,y:number){ ctx.save(); ctx.fillStyle="#fff"; ctx.strokeStyle="#3b82f6"; ctx.lineWidth=1.25; ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.restore(); }

  /* -------------------- Coords -------------------- */
  const screenToWorld = (pt:{x:number;y:number}) => { const cam=cameraRef.current; return { x:(pt.x-cam.tx)/cam.scale, y:(pt.y-cam.ty)/cam.scale }; };
  const worldToScreen = (pt:{x:number;y:number}) => { const cam=cameraRef.current; return { x:pt.x*cam.scale+cam.tx, y:pt.y*cam.scale+cam.ty }; };
  const canvasPoint = (e:React.MouseEvent<HTMLCanvasElement>) => { const rect=e.currentTarget.getBoundingClientRect(); return { x:e.clientX-rect.left, y:e.clientY-rect.top }; };

  /* -------------------- Pointer handlers -------------------- */
  function handlePointerDown(e: React.MouseEvent<HTMLCanvasElement>) {
    isPointerDownRef.current = true;
    const p = screenToWorld(canvasPoint(e));
    dragStartRef.current = p;

    if (!tool) {
      // No tool selected - just select shapes (like select tool but simpler)
      const hit = hitTest(p.x, p.y, shapes);
      if (hit) {
        setSelectedId(hit.shape.id);
        if (!canEdit) {
          // viewers can select but not mutate
          resizeHandleRef.current = null;
          isDraggingRef.current = false;
          draggedShapeRef.current = null;
          rotateRef.current = null;
          return;
        }
        resizeHandleRef.current = hit.handle;
        isDraggingRef.current = true;
        draggedShapeRef.current = JSON.parse(JSON.stringify(hit.shape)) as Shape;

        if (hit.handle === "rotate" && isRectLike(hit.shape)) {
          const s = hit.shape as RectLike;
          const { cx, cy } = getRectCenter(s);
          rotateRef.current = { cx, cy, startAngle: Math.atan2(p.y - cy, p.x - cx), initialDeg: s.rotation ?? 0 };
        } else rotateRef.current = null;
      } else {
        setSelectedId(null); resizeHandleRef.current = null; isDraggingRef.current = false; draggedShapeRef.current = null; rotateRef.current = null;
      }
      return;
    }

    if (tool === "select") {
      const hit = hitTest(p.x, p.y, shapes);
      if (hit) {
        setSelectedId(hit.shape.id);
        if (!canEdit) {
          // viewers can select but not mutate
          resizeHandleRef.current = null;
          isDraggingRef.current = false;
          draggedShapeRef.current = null;
          rotateRef.current = null;
          return;
        }
        resizeHandleRef.current = hit.handle;
        isDraggingRef.current = true;
        draggedShapeRef.current = JSON.parse(JSON.stringify(hit.shape)) as Shape;

        if (hit.handle === "rotate" && isRectLike(hit.shape)) {
          const s = hit.shape as RectLike;
          const { cx, cy } = getRectCenter(s);
          rotateRef.current = { cx, cy, startAngle: Math.atan2(p.y - cy, p.x - cx), initialDeg: s.rotation ?? 0 };
        } else rotateRef.current = null;
      } else {
        setSelectedId(null); resizeHandleRef.current = null; isDraggingRef.current = false; draggedShapeRef.current = null; rotateRef.current = null;
      }
      return;
    }

    if (tool === "text") return;

    // prevent creating shapes if cannot edit (selection handled above and already returned)
    if (!canEdit) return;

    const id = genId(); const stroke = "#111111"; const strokeWidth = 2;
    if (tool === "freehand") {
      draftShapeRef.current = { id, type:"freehand", points:[p], stroke, strokeWidth, bbox:{ x:p.x, y:p.y, w:0, h:0 } };
      requestNextFrame(); return;
    }

    if (["rect","ellipse","diamond","circle","triangle","cylinder","cloud","callout","starburst"].includes(tool)) {
      draftShapeRef.current = {
        id, type:tool as any, x:p.x, y:p.y, w:0, h:0, stroke, strokeWidth, fill: tool==="starburst" ? "#fff6" : undefined, rotation:0
      } as RectLike;
      requestNextFrame(); return;
    }

    draftShapeRef.current = { id, type:tool as any, x1:p.x, y1:p.y, x2:p.x, y2:p.y, stroke, strokeWidth } as LineLike;
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
    const id = genId();
    const base: TextShape = {
      id, type:"text", x:p.x, y:p.y, w:120, h:28, stroke:"#000000", strokeWidth:1,
      fill:"transparent", text:"", fontSize:20, fontFamily:"Inter, Arial", color:"#111111", rotation:0
    };
    setShapes((prev) => [...prev, base]);
    setSelectedId(id);
    if (boardId && canEdit) {
      socketRef.current?.emit("shape-create", { boardId: boardId, shape: base, user: { uid: auth.currentUser?.uid } });
    }
    setTextEditor({ visible: true, x: p.x, y: p.y, value: "", shapeId: id });
  }

  function handlePointerMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isPointerDownRef.current) return;
    const p = screenToWorld(canvasPoint(e));

    // Handle dragging when no tool is selected (acts like select tool)
    if (!tool && isDraggingRef.current && draggedShapeRef.current) {
      const start = dragStartRef.current!; const dx=p.x-start.x, dy=p.y-start.y; dragStartRef.current = p;
      let updated: Shape = JSON.parse(JSON.stringify(draggedShapeRef.current)) as Shape;

      if (resizeHandleRef.current) {
        if (resizeHandleRef.current === "rotate" && isRectLike(updated)) {
          const rot = rotateRef.current;
          if (rot) {
            const angNow = Math.atan2(p.y - rot.cy, p.x - rot.cx);
            let deltaDeg = radToDeg(angNow - rot.startAngle);
            let nextDeg = (rot.initialDeg ?? 0) + deltaDeg;
            if (e.shiftKey) nextDeg = Math.round(nextDeg / 15) * 15;
            (updated as RectLike).rotation = ((nextDeg % 360) + 360) % 360;
            draggedShapeRef.current = updated; mutatedDuringDragRef.current = true; requestNextFrame(); return;
          }
        }
        if (isRectLike(updated)) {
          let { x, y, w, h } = updated;
          if (nearlyZeroRotation(updated)) {
            if (resizeHandleRef.current.includes("n")) { const newY = y + dy; h = h - dy; y = newY; }
            if (resizeHandleRef.current.includes("s")) h = h + dy;
            if (resizeHandleRef.current.includes("w")) { const newX = x + dx; w = w - dx; x = newX; }
            if (resizeHandleRef.current.includes("e")) w = w + dx;
            const norm = normalizeRect({ x, y, w, h }); (updated as RectLike).x = norm.x; (updated as RectLike).y = norm.y; (updated as RectLike).w = norm.w; (updated as RectLike).h = norm.h;
          }
        } else if (isLineLike(updated)) {
          if (resizeHandleRef.current === "start") { (updated as LineLike).x1 += dx; (updated as LineLike).y1 += dy; }
          else if (resizeHandleRef.current === "end") { (updated as LineLike).x2 += dx; (updated as LineLike).y2 += dy; }
        }
      } else {
        if (isRectLike(updated)) { (updated as RectLike).x += dx; (updated as RectLike).y += dy; }
        else if (isLineLike(updated)) { (updated as LineLike).x1 += dx; (updated as LineLike).y1 += dy; (updated as LineLike).x2 += dx; (updated as LineLike).y2 += dy; }
        else if (isFreehand(updated)) {
          updated.points = updated.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
          (updated as Freehand).bbox = { x: (updated as Freehand).bbox.x + dx, y: (updated as Freehand).bbox.y + dy, w: (updated as Freehand).bbox.w, h: (updated as Freehand).bbox.h };
        }
      }

      draggedShapeRef.current = updated; mutatedDuringDragRef.current = true; requestNextFrame(); return;
    }

    if (!tool) return; // No tool selected, no shape creation

    if (tool === "freehand" && draftShapeRef.current && isFreehand(draftShapeRef.current)) {
      const d = draftShapeRef.current as Freehand; d.points.push(p); d.bbox = computeBBox(d.points); requestNextFrame(); return;
    }

    if (tool === "select" && isDraggingRef.current && draggedShapeRef.current) {
      const start = dragStartRef.current!; const dx=p.x-start.x, dy=p.y-start.y; dragStartRef.current = p;
      let updated: Shape = JSON.parse(JSON.stringify(draggedShapeRef.current)) as Shape;

      if (resizeHandleRef.current) {
        if (resizeHandleRef.current === "rotate" && isRectLike(updated)) {
          const rot = rotateRef.current;
          if (rot) {
            const angNow = Math.atan2(p.y - rot.cy, p.x - rot.cx);
            let deltaDeg = radToDeg(angNow - rot.startAngle);
            let nextDeg = (rot.initialDeg ?? 0) + deltaDeg;
            if (e.shiftKey) nextDeg = Math.round(nextDeg / 15) * 15;
            (updated as RectLike).rotation = ((nextDeg % 360) + 360) % 360;
            draggedShapeRef.current = updated; mutatedDuringDragRef.current = true; requestNextFrame(); return;
          }
        }
        if (isRectLike(updated)) {
          let { x, y, w, h } = updated;
          if (nearlyZeroRotation(updated)) {
            if (resizeHandleRef.current.includes("n")) { const newY = y + dy; h = h - dy; y = newY; }
            if (resizeHandleRef.current.includes("s")) h = h + dy;
            if (resizeHandleRef.current.includes("w")) { const newX = x + dx; w = w - dx; x = newX; }
            if (resizeHandleRef.current.includes("e")) w = w + dx;
            const norm = normalizeRect({ x, y, w, h }); (updated as RectLike).x = norm.x; (updated as RectLike).y = norm.y; (updated as RectLike).w = norm.w; (updated as RectLike).h = norm.h;
          }
        } else if (isLineLike(updated)) {
          if (resizeHandleRef.current === "start") { (updated as LineLike).x1 += dx; (updated as LineLike).y1 += dy; }
          else if (resizeHandleRef.current === "end") { (updated as LineLike).x2 += dx; (updated as LineLike).y2 += dy; }
        }
      } else {
        if (isRectLike(updated)) { (updated as RectLike).x += dx; (updated as RectLike).y += dy; }
        else if (isLineLike(updated)) { (updated as LineLike).x1 += dx; (updated as LineLike).y1 += dy; (updated as LineLike).x2 += dx; (updated as LineLike).y2 += dy; }
        else if (isFreehand(updated)) {
          updated.points = updated.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
          (updated as Freehand).bbox = { x: (updated as Freehand).bbox.x + dx, y: (updated as Freehand).bbox.y + dy, w: (updated as Freehand).bbox.w, h: (updated as Freehand).bbox.h };
        }
      }

      draggedShapeRef.current = updated; mutatedDuringDragRef.current = true; requestNextFrame(); return;
    }

    if (draftShapeRef.current) {
      const d = draftShapeRef.current as any;
      if (isRectLike(d)) {
        let dw=p.x - d.x, dh=p.y - d.y;
        if (d.type==="circle"){ const size=Math.max(Math.abs(dw),Math.abs(dh)); d.w=Math.sign(dw||1)*size; d.h=Math.sign(dh||1)*size; }
        else { d.w=dw; d.h=dh; }
      } else if (isLineLike(d)) { d.x2=p.x; d.y2=p.y; }
      requestNextFrame();
    }
  }

  function handlePointerUp() {
    isPointerDownRef.current = false;

    if (draftShapeRef.current && isFreehand(draftShapeRef.current)) {
      const d = draftShapeRef.current as Freehand; d.bbox = computeBBox(d.points);
      setShapes((prev) => [...prev, d]); 
      if (boardId && canEdit) {
        socketRef.current?.emit("shape-create",{boardId:boardId,shape:d,user:{uid:auth.currentUser?.uid}});
      }
      draftShapeRef.current=null;
    }
    if (draftShapeRef.current && !isFreehand(draftShapeRef.current)) {
      const d = draftShapeRef.current as any; let toAdd: Shape = d as Shape;
      if (isRectLike(d)) { const norm = normalizeRect({ x:d.x, y:d.y, w:d.w, h:d.h }); toAdd = { ...(d as RectLike), ...norm } as RectLike; }
      setShapes((prev) => [...prev, toAdd]); 
      if (boardId && canEdit) {
        socketRef.current?.emit("shape-create",{boardId:boardId,shape:toAdd,user:{uid:auth.currentUser?.uid}});
      }
      draftShapeRef.current=null;
    }

    if (isDraggingRef.current && draggedShapeRef.current && mutatedDuringDragRef.current) {
      const finalShape = draggedShapeRef.current, orig = shapes.find((s) => s.id === finalShape.id);
      if (orig) {
        setShapes((prev) => prev.map((s) => (s.id === finalShape.id ? finalShape : s)));
        const diff = diffShape(orig, finalShape);
        if (Object.keys(diff).length > 0 && boardId && canEdit) {
          socketRef.current?.emit("shape-update", { boardId: boardId, shapeId: finalShape.id, props: diff, user:{uid:auth.currentUser?.uid} });
        }
      }
    }

    isDraggingRef.current = false; draggedShapeRef.current = null; resizeHandleRef.current = null; dragStartRef.current = null; mutatedDuringDragRef.current = false; rotateRef.current = null;
  }

  /* -------------------- Hit test + helpers -------------------- */
  // function rectHandles(s:{x:number;y:number;w:number;h:number}){ const x2=s.x+s.w,y2=s.y+s.h; return [{name:"nw",x:s.x,y:s.y},{name:"ne",x:x2,y:s.y},{name:"sw",x:s.x,y:y2},{name:"se",x:x2,y:y2}] as any; }
  function hitTest(x:number,y:number,list:Shape[]):{shape:Shape;handle:string|null}|null{
    for (let i=list.length-1;i>=0;i--){
      const s=list[i];
      if (isFreehand(s)){ if (polylineHit(x,y,s.points,6)) return {shape:s,handle:null}; continue; }
      if (isRectLike(s)){
        const rh = rectHandlesRotated(s).find(h=>h.name==="rotate")!; if (distance(x,y,rh.x,rh.y)<=8) return {shape:s,handle:"rotate"};
        if (nearlyZeroRotation(s)){ const corners = rectHandlesRotated(s).filter(h=>h.name!=="rotate"); const hitCorner=corners.find(h=>Math.abs(h.x-x)<=6 && Math.abs(h.y-y)<=6); if (hitCorner) return {shape:s,handle:hitCorner.name}; }
        const loc = toLocalOfRect(s,x,y); if (Math.abs(loc.lx)<=loc.halfW && Math.abs(loc.ly)<=loc.halfH) return {shape:s,handle:null};
      } else {
        const l=s as LineLike;
        if (distance(x,y,l.x1,l.y1)<=6) return {shape:s,handle:"start"} as any;
        if (distance(x,y,l.x2,l.y2)<=6) return {shape:s,handle:"end"} as any;
        if (l.type==="orthogonal"){ const bend={x:l.x2,y:l.y1}; if (pointToSegmentDistance(x,y,l.x1,l.y1,bend.x,bend.y)<6) return {shape:s,handle:null};
          if (pointToSegmentDistance(x,y,bend.x,bend.y,l.x2,l.y2)<6) return {shape:s,handle:null}; }
        else if (pointToSegmentDistance(x,y,l.x1,l.y1,l.x2,l.y2)<6) return {shape:s,handle:null};
      }
    }
    return null;
  }
  const distance=(ax:number,ay:number,bx:number,by:number)=>Math.hypot(ax-bx,ay-by);
  function pointToSegmentDistance(px:number,py:number,x1:number,y1:number,x2:number,y2:number){ const A=px-x1,B=py-y1,C=x2-x1,D=y2-y1; const dot=A*C+B*D; const lenSq=C*C+D*D||1; let t=dot/lenSq; t=Math.max(0,Math.min(1,t)); const xx=x1+t*C, yy=y1+t*D; return Math.hypot(px-xx,py-yy); }
  function polylineHit(x:number,y:number,pts:{x:number;y:number}[],tol:number){ for (let i=1;i<pts.length;i++){ if (pointToSegmentDistance(x,y,pts[i-1].x,pts[i-1].y,pts[i].x,pts[i].y)<=tol) return true; } return false; }
  function computeBBox(pts:{x:number;y:number}[]){ let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity; for (const p of pts){ if (p.x<minX) minX=p.x; if (p.y<minY) minY=p.y; if (p.x>maxX) maxX=p.x; if (p.y>maxY) maxY=p.y; } return { x:minX,y:minY,w:maxX-minX,h:maxY-minY }; }
  function normalizeRect(r:{x:number;y:number;w:number;h:number}){ let {x,y,w,h}=r; if (w<0){ x=x+w; w=-w; } if (h<0){ y=y+h; h=-h; } return {x,y,w,h}; }
  function diffShape(prev:Shape,next:Shape){ const diff:any={}; for (const k of Object.keys(next) as (keyof Shape)[]){ if ((next as any)[k] !== (prev as any)[k]) diff[k] = (next as any)[k]; } return diff; }

  /* -------------------- Keyboard (copy/paste/delete) -------------------- */
  function cloneForPaste(s:Shape):Shape{
    const id=genId(), offset=16;
    if (isRectLike(s)){ const base=s as RectLike|TextShape; return { ...base, id, x:(base as RectLike).x+offset, y:(base as RectLike).y+offset } as Shape; }
    if (isLineLike(s)){ const l=s as LineLike; return { ...l, id, x1:l.x1+offset, y1:l.y1+offset, x2:l.x2+offset, y2:l.y2+offset } as Shape; }
    const f=s as Freehand; const pts=f.points.map(p=>({x:p.x+offset,y:p.y+offset})); const b=computeBBox(pts); return { ...f, id, points:pts, bbox:b } as Shape;
  }
  const copySelected=()=>{ const id=selectedIdRef.current; if (!id) return; const s=shapesRef.current.find(sh=>sh.id===id); if (!s) return; clipboardRef.current = JSON.parse(JSON.stringify(s)); };
  const cutSelected=()=>{ copySelected(); deleteSelected(); };
  const pasteClipboard=()=>{ 
    const clip=clipboardRef.current; if (!clip) return; 
    const pasted=cloneForPaste(clip); 
    setShapes(prev=>[...prev,pasted]); 
    setSelectedId(pasted.id); 
    if (boardId && canEdit) {
      socketRef.current?.emit("shape-create",{boardId:boardId,shape:pasted,user:{uid:auth.currentUser?.uid}});
    }
  };
  const deleteSelected=()=>{ 
    const id=selectedIdRef.current; if (!id) return; 
    isDraggingRef.current=false; 
    draggedShapeRef.current=null; 
    setShapes(prev=>prev.filter(s=>s.id!==id)); 
    setSelectedId(null); 
    if (boardId && canEdit) {
      socketRef.current?.emit("shape-delete",{boardId:boardId,shapeId:id,user:{uid:auth.currentUser?.uid}});
    }
  };

  useEffect(()=> {
    const isTypingTarget=()=>{ const el=document.activeElement as HTMLElement|null;
      return textEditor.visible || (el && (el.tagName==="INPUT" || el.tagName==="TEXTAREA" || (el as any).isContentEditable));
    };
    const onKeyDown=(e:KeyboardEvent)=> {
      if (isTypingTarget()) return;
      const mod=e.metaKey||e.ctrlKey; const key=e.key.toLowerCase();
      if (e.key==="Delete"||e.key==="Backspace"){ if (selectedIdRef.current){ e.preventDefault(); deleteSelected(); } return; }
      if (mod && key==="c"){ if (selectedIdRef.current){ e.preventDefault(); copySelected(); } return; }
      if (mod && key==="x"){ if (selectedIdRef.current){ e.preventDefault(); cutSelected(); } return; }
      if (mod && key==="v"){ e.preventDefault(); pasteClipboard(); return; }
    };
    window.addEventListener("keydown", onKeyDown);
    return ()=>window.removeEventListener("keydown", onKeyDown);
  }, [textEditor.visible]);

  /* -------------------- Pan / Zoom -------------------- */
  useEffect(()=> {
    const el=wrapperRef.current; if (!el) return;
    const onWheel=(e:WheelEvent)=> {
      e.preventDefault();
      const cam=cameraRef.current;
      if (e.ctrlKey){
        const rect=(canvasRef.current as HTMLCanvasElement).getBoundingClientRect();
        const sx=e.clientX-rect.left, sy=e.clientY-rect.top;
        const worldBefore=screenToWorld({x:sx,y:sy});
        const newScale=Math.max(0.25, Math.min(3, cam.scale*(1 - e.deltaY*0.0015)));
        cam.scale=newScale;
        cam.tx = sx - worldBefore.x*newScale; cam.ty = sy - worldBefore.y*newScale;
      } else { cam.tx -= e.deltaX; cam.ty -= e.deltaY; }
      setViewVersion(v=>v+1);
      requestNextFrame();
    };
    el.addEventListener("wheel", onWheel, { passive:false });
    return ()=> el.removeEventListener("wheel", onWheel as any);
  }, []);

  /* -------------------- Layout -------------------- */
  useEffect(()=> {
    const onResize=()=>{ 
      if (!canvasRef.current) return; 
      canvasRef.current.width=window.innerWidth; 
      canvasRef.current.height=window.innerHeight-110; 
      requestNextFrame(); 
    };
    onResize(); 
    window.addEventListener("resize", onResize);
    return ()=>window.removeEventListener("resize", onResize);
  }, []);

  /* -------------------- UI -------------------- */
  const palette=["#111111","#EF4444","#F59E0B","#10B981","#3B82F6","#8B5CF6","#EC4899","#000000","#FFFFFF"];

  return (
    <main>
      {showLoadingOverlay && (
        <div className="fixed inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-lg font-semibold text-gray-700">Loading board...</p>
          </div>
        </div>
      )}
      <div style={{ width:"100vw", height:"100vh", display:"flex", flexDirection:"column" }}>
        <div className="flex justify-between py-2 px-5 bg-green-200">
          <button className="hover:bg-pink-600 px-4 rounded-md hover:text-white font-bold" onClick={()=>navigate("/boards")} style={{ cursor:"pointer" }}>← Back</button>
          <div className="bg-blue-100 py-1 px-3 rounded-md">
            {([
              ["select","Select"],["rect","□"],["ellipse","◯"],["circle","●"],["diamond","◇"],["triangle","△"],
              ["line","─"],["arrow","→"],["arrowDouble","⇄"],["orthogonal","└"],["cylinder","DB"],["cloud","☁︎"],["callout","💬"],["starburst","✷"],["text","T"],["freehand","✎"],
            ] as [Tool,string][]).map(([t,label])=>(
              <button 
                key={t} 
                onClick={()=>setTool(t)} 
                style={{ 
                  padding:"6px 10px", 
                  borderRadius:6, 
                  border:"none", 
                  background: tool===t ? "#eff6ff" : "transparent", 
                  cursor: canEdit ? "pointer" : "not-allowed",
                  opacity: canEdit ? 1 : 0.5
                }} 
                title={t}
                disabled={!canEdit}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={boardName}
              onChange={(e)=>setBoardName(e.target.value)}
              placeholder="Untitled document"
              style={{ border:"none", fontSize:16, textAlign:"right", outline:"none" }}
              className="font-semibold"
              readOnly={!canEdit}
            />
            {!isPublic && (
              <button
                className="px-6 py-2 ml-3  text-sm font-semibold rounded-md bg-pink-600 text-white hover:bg-pink-700"
                style={{ cursor: "pointer", opacity: isOwner ? 1 : 0.6 }}
                onClick={()=> isOwner && setShareOpen(true)}
                title={isOwner ? "Share" : "Only owners can share"}
              >Share</button>
            )}
            
          </div>
        </div>

                {selectedId && canEdit && (()=> {
          const sel=shapes.find(s=>s.id===selectedId); if (!sel) return null;
          const updateSel=(props:Partial<Shape>)=>{
            setShapes(prev=>prev.map(s=>s.id===selectedId? ({...s, ...props} as Shape) : s));
            if (boardId && canEdit) {
              socketRef.current?.emit("shape-update",{boardId:boardId,shapeId:selectedId,props,user:{uid:auth.currentUser?.uid}});
            }
          };
          return (
            <div className="bg-white flex justify-center mx-auto gap-4 my-2 ">
              <span className="mt-1">Selected: {(sel as any).type}</span>
              <label style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span>Width</span>
                <input type="number" min={1} max={14} value={(sel as any).strokeWidth || 2}
                  onChange={(e)=>updateSel({ strokeWidth:Number(e.target.value)||1 } as any)}
                  style={{ width:64 }} />
              </label>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                {palette.map((c)=>(
                  <button key={c} title={c}
                    onClick={()=>{ if ((sel as any).type==="text") updateSel({ color:c } as any); else if (isRectLike(sel)) updateSel({ fill:c } as any); else updateSel({ stroke:c } as any); }}
                    style={{ width:18, height:18, borderRadius:4, border:"1px solid #e5e5e5", background:c, cursor:"pointer" }} />
                ))}
              </div>
              {isRectLike(sel) && (
                <label style={{ display:"flex", alignItems:"center", gap:6, marginLeft:12 }}>
                  <span>Angle°</span>
                  <input type="number" step={1} value={(sel as RectLike).rotation ?? 0}
                    onChange={(e)=>{ const v=((Number(e.target.value)||0)%360+360)%360; updateSel({ rotation:v } as any); }}
                    style={{ width:72 }} />
                  <button onClick={()=>{ const curr=(sel as RectLike).rotation ?? 0; updateSel({ rotation:((curr-15+360)%360) } as any); }}
                    style={{ padding:"2px 8px", border:"1px solid #e5e7eb", borderRadius:6 }} title="Rotate -15°">↶ 15°</button>
                  <button onClick={()=>{ const curr=(sel as RectLike).rotation ?? 0; updateSel({ rotation:((curr+15)%360) } as any); }}
                    style={{ padding:"2px 8px", border:"1px solid #e5e7eb", borderRadius:6 }} title="Rotate +15°">↷ 15°</button>
                </label>
              )}
            </div>
          );
        })()}

        <div ref={wrapperRef} style={{ position:"relative", flex:1, background: GRID_BG }}>
          <canvas
            ref={canvasRef}
            width={window.innerWidth}
            height={window.innerHeight - 110}
            onMouseDown={handlePointerDown}
            onDoubleClick={handleDoubleClick}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            style={{ width:"100%", height:"100%", display:"block", cursor: !tool || tool==="select" ? "default" : "crosshair", background:"transparent" }}
          />
          {shareOpen && (
            <div style={{ position:"absolute", inset:0, background:"#0006", display:"grid", placeItems:"center" }} onClick={()=> setShareOpen(false)}>
              <div onClick={(e)=> e.stopPropagation()} style={{ width:520, background:"#fff", borderRadius:12, padding:20, boxShadow:"0 10px 30px rgba(0,0,0,0.2)" }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Share "{boardName}"</h3>
                  <button onClick={()=> setShareOpen(false)} style={{ cursor:"pointer" }}>✕</button>
                </div>
                
                {/* Public Link Section */}
                <div className="mb-6 p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-slate-800">Public Link</h4>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={publicAccess.enabled}
                        onChange={async (e) => {
                          try {
                            const r = await fetch(`${API_BASE}/api/boards/${boardId}/public-access`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              credentials: "include",
                              body: JSON.stringify({ 
                                enabled: e.target.checked, 
                                role: publicAccess.role 
                              })
                            });
                            if (!r.ok) { const j = await r.json().catch(()=>null); alert(j?.message || `Failed (${r.status})`); return; }
                            fetchBoard(true);
                          } catch (e:any) { alert(e?.message || 'Failed'); }
                        }}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                      <span className="text-sm text-slate-600">Enable public access</span>
                    </label>
                  </div>
                  
                  {publicAccess.enabled && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <select 
                          value={publicAccess.role} 
                          onChange={async (e) => {
                            try {
                              const r = await fetch(`${API_BASE}/api/boards/${boardId}/public-access`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                credentials: "include",
                                body: JSON.stringify({ 
                                  enabled: true, 
                                  role: e.target.value as CollaboratorRole 
                                })
                              });
                              if (!r.ok) { const j = await r.json().catch(()=>null); alert(j?.message || `Failed (${r.status})`); return; }
                              fetchBoard(true);
                            } catch (e:any) { alert(e?.message || 'Failed'); }
                          }}
                          className="px-3 py-1.5 border border-slate-300 rounded text-sm"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                        <span className="text-sm text-slate-600">can access via link</span>
                      </div>
                      
                      <div className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded">
                        <input
                          value={`${window.location.origin}/board/${boardId}`}
                          readOnly
                          className="flex-1 text-sm border-none outline-none bg-transparent"
                        />
                        <button
                          onClick={() => navigator.clipboard.writeText(`${window.location.origin}/board/${boardId}`)}
                          className="px-3 py-1.5 text-xs bg-slate-600 text-white rounded hover:bg-slate-700"
                          style={{ cursor: "pointer" }}
                        >
                          Copy
                        </button>
                      </div>
                      
                      <div className="text-xs text-slate-500 bg-blue-50 p-2 rounded">
                        💡 Anyone with this link can now view this board. The link will work for both authenticated and anonymous users.
                      </div>
                    </div>
                  )}
                </div>

                {/* Invite by Email Section */}
                <div className="mb-6">
                  <h4 className="font-medium text-slate-800 mb-3">Invite by Email</h4>
                  <div className="flex gap-2">
                    <input
                      value={inviteEmail}
                      onChange={(e)=> setInviteEmail(e.target.value)}
                      placeholder="Enter email address"
                      style={{ flex:1, border:"1px solid #e5e7eb", borderRadius:8, padding:"8px 10px" }}
                    />
                    <select value={inviteRole} onChange={(e)=> setInviteRole(e.target.value as CollaboratorRole)} style={{ border:"1px solid #e5e7eb", borderRadius:8, padding:"8px 10px" }}>
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button
                      onClick={async ()=>{
                        const email = inviteEmail.trim(); if (!email) return;
                        try {
                          const r = await fetch(`${API_BASE}/api/boards/${boardId}/invite`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ email, role: inviteRole })
                          });
                          if (!r.ok) { const j = await r.json().catch(()=>null); alert(j?.message || `Invite failed (${r.status})`); return; }
                          setInviteEmail("");
                          fetchBoard(true);
                        } catch (e:any) { alert(e?.message || 'Invite failed'); }
                      }}
                      className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                      style={{ cursor:"pointer" }}
                    >Invite</button>
                  </div>
                </div>

                {/* People with Access Section */}
                <div>
                  <h4 className="font-medium text-slate-800 mb-3">People with Access</h4>
                  <ul className="max-h-48 overflow-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    <li className="py-3 px-3 flex items-center justify-between bg-slate-50">
                      <div>
                        <div className="text-sm font-medium">Owner</div>
                        <div className="text-xs text-slate-500">You</div>
                      </div>
                      <span className="text-xs rounded bg-slate-200 px-2 py-1 font-medium">owner</span>
                    </li>
                    {collaborators.map((c)=> (
                      <li key={c.email} className="py-3 px-3 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <div className="text-sm font-medium">{c.email}</div>
                          <div className="text-xs text-slate-500">{c.status || 'invited'}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={c.role}
                            onChange={async (e) => {
                              try {
                                const r = await fetch(`${API_BASE}/api/boards/${boardId}/collaborators/${encodeURIComponent(c.email)}/role`, {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  credentials: "include",
                                  body: JSON.stringify({ role: e.target.value })
                                });
                                if (!r.ok) { const j = await r.json().catch(()=>null); alert(j?.message || `Failed (${r.status})`); return; }
                                fetchBoard(true);
                              } catch (e:any) { alert(e?.message || 'Failed'); }
                            }}
                            className="text-xs border border-slate-300 rounded px-2 py-1"
                            disabled={!isOwner}
                          >
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                          </select>
                          {isOwner && (
                            <button
                              onClick={async () => {
                                if (!confirm(`Remove ${c.email} from this board?`)) return;
                                try {
                                    const r = await fetch(`${API_BASE}/api/boards/${boardId}/collaborators/${encodeURIComponent(c.email)}`, {
                                    method: "DELETE",
                                    credentials: "include"
                                  });
                                  if (!r.ok) { const j = await r.json().catch(()=>null); alert(j?.message || `Failed (${r.status})`); return; }
                                  fetchBoard(true);
                                } catch (e:any) { alert(e?.message || 'Failed'); }
                              }}
                              className="text-xs text-red-600 hover:text-red-700 px-2 py-1"
                              style={{ cursor: "pointer" }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
          {textEditor.visible && (()=> {
            const scr=worldToScreen({x:textEditor.x,y:textEditor.y});
            return (
              <textarea
                autoFocus
                value={textEditor.value}
                onChange={(e)=>setTextEditor(t=>({...t, value:e.target.value}))}
                onBlur={()=>finalizeTextEditor()}
                onKeyDown={(e)=>{ if (e.key==="Enter" && !e.shiftKey){ e.preventDefault(); finalizeTextEditor(); } }}
                style={{ position:"absolute", left:scr.x, top:scr.y, width:240, height:60, border:"1px solid #3b82f6", borderRadius:6, padding:6, background:"#fff", outline:"none" }}
              />
            );
          })()}
        </div>
      </div>
    </main>
  );

  /* -------------------- Text finalize -------------------- */
  function finalizeTextEditor() {
    if (!textEditor.visible) return;
    const shape = shapes.find((s) => s.id === textEditor.shapeId) as TextShape | undefined;
    if (!shape) { setTextEditor({ visible:false, x:0, y:0, value:"", shapeId:null }); return; }
    const value = textEditor.value;
    if (!value.trim()) {
      const next = shapes.filter((s) => s.id !== shape.id);
      setShapes(next);
      if (boardId && canEdit) {
        socketRef.current?.emit("shape-delete", { boardId: boardId, shapeId: shape.id });
      }
      setTextEditor({ visible:false, x:0, y:0, value:"", shapeId:null });
      return;
    }
    const dim = measureText(value, shape.fontSize, shape.fontFamily);
    const next: TextShape = { ...shape, text:value, w:dim.width, h:dim.height };
    setShapes((prev) => prev.map((s) => (s.id === shape.id ? next : s)));
            if (boardId && canEdit) {
          socketRef.current?.emit("shape-update", { boardId: boardId, shapeId: shape.id, props: { text: next.text, w: next.w, h: next.h }, user:{uid:auth.currentUser?.uid} });
        }
    setTextEditor({ visible:false, x:0, y:0, value:"", shapeId:null });
  }
}
