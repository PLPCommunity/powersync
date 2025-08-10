import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';

type Board = { _id: string; name: string; description?: string };

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

function App() {
  const navigate = useNavigate();
  const [boards, setBoards] = useState<Board[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/boards`)
      .then((r) => r.json())
      .then(setBoards)
      .catch(() => {});
  }, []);

  const createBoardAndOpen = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Untitled document' }),
      });
      const created = await res.json();
      if (res.ok) {
        navigate(`/boards/${created._id}`);
      } else {
        alert(created?.message || 'Failed to create board');
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 16 }}>Your Boards</h1>
      <button onClick={createBoardAndOpen} disabled={isCreating} style={{ marginBottom: 24 }}>
        {isCreating ? 'Creating…' : 'Create new board'}
      </button>

      <ul style={{ display: 'grid', gap: 8, padding: 0, listStyle: 'none' }}>
        {boards.map((b) => (
          <li key={b._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e5e5e5', padding: 12, borderRadius: 8 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{b.name || 'Untitled document'}</div>
              {b.description && <div style={{ opacity: 0.75, fontSize: 12 }}>{b.description}</div>}
            </div>
            <button className='' onClick={() => navigate(`/boards/${b._id}`)}>Open</button>
          </li>
        ))}
      </ul>
    </main>
  );
}

export default App;
