import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import './App.css';

type Board = {
  _id: string;
  name: string;
  description?: string;
};

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

function App() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const socketRef = useRef<Socket | null>(null);

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

  // Socket listeners for drawing
  useEffect(() => {
    if (!activeBoard) return;
    socketRef.current?.emit('join-board', { boardId: activeBoard._id });
    const onDraw = (data: any) => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      ctx.strokeStyle = data.color || '#000000';
      ctx.lineWidth = data.width || 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(data.from.x, data.from.y);
      ctx.lineTo(data.to.x, data.to.y);
      ctx.stroke();
    };
    socketRef.current?.on('draw', onDraw);
    return () => {
      socketRef.current?.off('draw', onDraw);
    };
  }, [activeBoard]);

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

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeBoard) return;
    isDrawingRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    lastPointRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeBoard || !isDrawingRef.current || !lastPointRef.current || !canvasRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    socketRef.current?.emit('draw', { boardId: activeBoard._id, from: lastPointRef.current, to: current, color: '#000000', width: 2 });
    lastPointRef.current = current;
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1>Boards</h1>
      <form onSubmit={submitBoard} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Board name"
          required
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
        />
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
              <button onClick={() => setActiveBoard(b)}>Open</button>
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
          <canvas
            ref={canvasRef}
            width={900}
            height={600}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            style={{ width: 900, height: 600, border: '1px solid #e5e5e5', borderRadius: 8, background: '#ffffff' }}
          />
        </section>
      )}
    </main>
  );
}

export default App;
