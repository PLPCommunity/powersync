// src/components/AllBoards.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, MoreVertical, FileText, Calendar, Search, Trash2, Copy, Edit3, ExternalLink
} from "lucide-react";

type Board = { _id: string; name: string; description?: string; createdAt?: string; updatedAt?: string };
const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://localhost:5000";

export default function AllBoards() {
  const navigate = useNavigate();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/boards`);
        const data = await r.json();
        if (alive) setBoards(Array.isArray(data) ? data : []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter(b =>
      b.name?.toLowerCase().includes(q) || b.description?.toLowerCase().includes(q)
    );
  }, [boards, query]);

  async function createBoardAndOpen() {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/boards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled document" }),
      });
      const created = await res.json();
      if (res.ok && created?._id) {
        // Optionally update local list so it appears when user navigates back
        setBoards(prev => [{ ...created }, ...prev]);
        // ✅ Navigate to the new board (SINGULAR route)
        navigate(`/board/${created._id}`);
      } else {
        alert(created?.message || "Failed to create board");
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function renameBoard(id: string) {
    const current = boards.find(b => b._id === id);
    const next = prompt("Rename board:", current?.name ?? "Untitled document");
    if (next == null || !next.trim()) return;
    setBoards(prev => prev.map(b => (b._id === id ? { ...b, name: next.trim() } : b)));
    try {
      await fetch(`${API_BASE}/api/boards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next.trim() }),
      });
    } catch {}
  }

  async function duplicateBoard(id: string) {
    const src = boards.find(b => b._id === id);
    const name = src?.name ? `${src.name} (Copy)` : "Untitled document (Copy)";
    try {
      const res = await fetch(`${API_BASE}/api/boards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: src?.description ?? "" }),
      });
      const created = await res.json();
      if (res.ok) setBoards(prev => [{ ...created }, ...prev]);
      else alert("Failed to duplicate");
    } catch {}
  }

  async function deleteBoard(id: string) {
    const ok = confirm("Delete this board? This cannot be undone.");
    if (!ok) return;
  
    const prev = boards;
    setBoards(p => p.filter(b => b._id !== id)); // optimistic
  
    try {
      const res = await fetch(`${API_BASE}/api/boards/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const payload = (res.headers.get('content-type') || '').includes('application/json') ? await res.json().catch(() => null) : null;
  
      if (!res.ok) {
        setBoards(prev); // revert for 5xx/other errors
        alert(payload?.message || `Failed to delete (HTTP ${res.status})`);
      }
    } catch (e: any) {
      setBoards(prev);
      alert(e?.message || 'Failed to delete board');
    }
  }
  
  

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">My Boards</h1>
            <p className="mt-1 text-sm text-slate-500">
              {boards.length} {boards.length === 1 ? "board" : "boards"}
            </p>
          </div>
          <button
            onClick={createBoardAndOpen}
            disabled={isCreating}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {isCreating ? "Creating…" : "New Board"}
          </button>
        </div>

        <div className="mt-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search boards..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-slate-300"
            />
          </div>
        </div>
      </div>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        {loading ? (
          <SkeletonGrid />
        ) : filtered.length === 0 ? (
          <EmptyState onCreate={createBoardAndOpen} />
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((b) => (
              <li key={b._id}>
                <BoardCard
                  board={b}
                  onOpen={() => navigate(`/board/${b._id}`)}  
                  onOpenNewTab={() => window.open(`/board/${b._id}`, "_blank")}
                  onRename={() => renameBoard(b._id)}
                  onDuplicate={() => duplicateBoard(b._id)}
                  onDelete={() => deleteBoard(b._id)}
                  openMenuId={openMenuId}
                  setOpenMenuId={setOpenMenuId}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/* ---- subcomponents (unchanged visually) ---- */

function BoardCard({ board, onOpen, onOpenNewTab, onRename, onDuplicate, onDelete, openMenuId, setOpenMenuId }: any) {
  const gradient = gradientFromId(board._id);
  return (
    <div onClick={onOpen} className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative h-28 w-full"
        style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}>
        <div className="absolute inset-0 grid place-items-center text-slate-600/70">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/70 shadow-sm backdrop-blur">
            <FileText className="h-5 w-5" />
          </div>
        </div>
      </div>
      <div className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900">{board.name || "Untitled document"}</h3>
          </div>
          <div className="relative flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button aria-label="delete board" onClick={onDelete} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete">
              <Trash2 className="h-5 w-5" />
            </button>
            <button aria-label="board menu" onClick={() => setOpenMenuId(openMenuId === board._id ? null : board._id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700" title="More">
              <MoreVertical className="h-5 w-5" />
            </button>
            {openMenuId === board._id && (
              <div className=" right-0 top-9 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                <MenuItem icon={<ExternalLink className="h-4 w-4" />} label="Open in new tab" onClick={onOpenNewTab} />
                <MenuItem icon={<Edit3 className="h-4 w-4" />} label="Rename" onClick={onRename} />
                <MenuItem icon={<Copy className="h-4 w-4" />} label="Duplicate" onClick={onDuplicate} />
                <div className="my-1 border-t border-slate-200" />
                <MenuItem icon={<Trash2 className="h-4 w-4" />} label="Delete" danger onClick={onDelete} />
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Calendar className="h-3.5 w-3.5" />
          <span>{board.updatedAt}</span>
        </div>
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: any) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-50 ${danger ? "text-red-600 hover:text-red-700" : "text-slate-700"}`}>
      {icon}<span>{label}</span>
    </button>
  );
}
function SkeletonGrid() { return null as any; } 
function EmptyState({ onCreate }: { onCreate: () => void }) {  return null as any; }
function gradientFromId(id: string): [string, string] {return ["#fff","#fff"]; }
