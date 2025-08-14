// src/components/AllBoards.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  MoreVertical,
  FileText,
  Calendar,
  Search,
  Trash2,
  Copy,
  Edit3,
  ExternalLink,
} from "lucide-react";
import { useSelector } from "react-redux";
import { selectUser } from "../features/userSlice";
import Login from "../Components/Login";

type Board = {
  _id: string;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || "http://localhost:5000";

export default function AllBoards() {
  const navigate = useNavigate();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const user = useSelector(selectUser);

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
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter(
      (b) =>
        b.name?.toLowerCase().includes(q) ||
        b.description?.toLowerCase().includes(q)
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
        setBoards((prev) => [{ ...created }, ...prev]);
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
    const current = boards.find((b) => b._id === id);
    const next = prompt("Rename board:", current?.name ?? "Untitled document");
    if (next == null || !next.trim()) return;
    setBoards((prev) =>
      prev.map((b) => (b._id === id ? { ...b, name: next.trim() } : b))
    );
    try {
      await fetch(`${API_BASE}/api/boards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next.trim() }),
      });
    } catch {}
  }

  async function duplicateBoard(id: string) {
    const src = boards.find((b) => b._id === id);
    const name = src?.name ? `${src.name} (Copy)` : "Untitled document (Copy)";
    try {
      const res = await fetch(`${API_BASE}/api/boards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: src?.description ?? "" }),
      });
      const created = await res.json();
      if (res.ok) setBoards((prev) => [{ ...created }, ...prev]);
      else alert("Failed to duplicate");
    } catch {}
  }

  async function deleteBoard(id: string) {
    const ok = confirm("Delete this board? This cannot be undone.");
    if (!ok) return;

    const prev = boards;
    setBoards((p) => p.filter((b) => b._id !== id)); // optimistic

    try {
      const res = await fetch(
        `${API_BASE}/api/boards/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      const payload = (res.headers.get("content-type") || "").includes(
        "application/json"
      )
        ? await res.json().catch(() => null)
        : null;

      if (!res.ok) {
        setBoards(prev); // revert for 5xx/other errors
        alert(payload?.message || `Failed to delete (HTTP ${res.status})`);
      }
    } catch (e: any) {
      setBoards(prev);
      alert(e?.message || "Failed to delete board");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {!user ? (
        <main>
          <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
            <Link to="/" className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white">
                {/* simple lock icon */}
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="currentColor"
                >
                  <path d="M17 8h-1V6a4 4 0 10-8 0v2H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-8a2 2 0 00-2-2zm-7-2a2 2 0 114 0v2H10V6zm8 12H6v-8h12v8z" />
                </svg>
              </div>
              <span className="text-lg font-semibold">DrawBoard</span>
            </Link>

            <nav className="hidden gap-6 text-sm md:flex">
              <span className="text-slate-500">Features</span>
              <span className="text-slate-500">Pricing</span>
              <span className="text-slate-500">Docs</span>
            </nav>
          </header>

          {/* <Login/> */}
          <main className="mx-auto max-w-6xl px-6 pb-24 pt-10 md:pt-16">
            <section className="mx-auto max-w-3xl text-center">
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
                Sign in to start drawing together
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
                A clean, collaborative canvas for sketches, flowcharts, and
                ideas. Create boards, invite teammates, and bring plans to
                life—fast.
              </p>

              {/* CTA row (no functionality—just text/buttons) */}
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Login />
              </div>

              {/* Helper text */}
              <p className="mt-3 text-xs text-slate-500">
                No credit card needed • Cancel anytime
              </p>
            </section>
          </main>
          <footer className="border-t border-slate-200">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-slate-500 sm:flex-row">
              <span>
                © {new Date().getFullYear()} DrawBoard. All rights reserved.
              </span>
              <div className="flex items-center gap-4">
                <a href="#" className="hover:text-slate-700">
                  Privacy
                </a>
                <a href="#" className="hover:text-slate-700">
                  Terms
                </a>
                <a href="#" className="hover:text-slate-700">
                  Status
                </a>
              </div>
            </div>
          </footer>
        </main>
      ) : (
        <>
          <div className="mx-auto w-full max-w-6xl px-6 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                  My Boards
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {boards.length} {boards.length === 1 ? "board" : "boards"}
                </p>
              </div>
              <button
                onClick={createBoardAndOpen}
                disabled={isCreating}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
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
                      onOpenNewTab={() =>
                        window.open(`/board/${b._id}`, "_blank")
                      }
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
        </>
      )}
    </main>
  );
}

/* ---- subcomponents (unchanged visually) ---- */

function BoardCard({
  board,
  onOpen,
  onOpenNewTab,
  onRename,
  onDuplicate,
  onDelete,
  openMenuId,
  setOpenMenuId,
}: any) {
  const gradient = useMemo(() => gradientFromId(board._id), [board._id]);
  function gradientFromId(id: string): [string, string] {
    let hash = 0;
    for (let i = 0; i < id.length; i++)
      hash = (hash * 31 + id.charCodeAt(i)) | 0;

    const hue1 = (hash >>> 0) % 360;
    const hue2 = (hue1 + 30 + ((hash >>> 8) % 60)) % 360;

    // Pastel-ish: high saturation, high lightness
    const c1 = `hsl(${hue1}, 92%, 88%)`;
    const c2 = `hsl(${hue2}, 92%, 80%)`;
    return [c1, c2];
  }

  return (
    <div
      onClick={onOpen}
      // remove overflow-hidden so the menu isn't clipped; bump z-index when menu is open
      className={`group relative cursor-pointer rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        openMenuId === board._id ? "z-50" : ""
      }`}
    >
      {/* Preview header with proper gradient + rounded top */}
      <div
        className="relative h-28 w-full rounded-t-2xl"
        style={{
          background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
        }}
      >
        <div className="absolute inset-0 grid place-items-center text-slate-600/70">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/70 shadow-sm backdrop-blur">
            <FileText className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900">
              {board.name || "Untitled document"}
            </h3>
            {board.description ? (
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                {board.description}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-400">—</p>
            )}
          </div>

          {/* Keep clicks here from opening the card */}
          <div
            className="relative flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="delete board"
              onClick={onDelete}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 cursor-pointer"
              title="Delete"
            >
              <Trash2 className="h-5 w-5" />
            </button>

            <button
              aria-label="board menu"
              onClick={() =>
                setOpenMenuId(openMenuId === board._id ? null : board._id)
              }
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700  cursor-pointer"
              title="More"
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {/* Dropdown */}
            {openMenuId === board._id && (
              <div className="absolute right-0 top-9 z-50 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white/95 py-1 text-sm shadow-2xl backdrop-blur-md">
                <MenuItem
                  icon={<ExternalLink className="h-4 w-4" />}
                  label="Open in new tab"
                  onClick={onOpenNewTab}
                />
                <MenuItem
                  icon={<Edit3 className="h-4 w-4" />}
                  label="Rename"
                  onClick={onRename}
                />
                <MenuItem
                  icon={<Copy className="h-4 w-4" />}
                  label="Duplicate"
                  onClick={onDuplicate}
                />
                <div className="my-1 border-t border-slate-200" />
                <MenuItem
                  icon={<Trash2 className="h-4 w-4" />}
                  label="Delete"
                  danger
                  onClick={onDelete}
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Calendar className="h-3.5 w-3.5" />
          <span>{board.updatedAt || board.createdAt}</span>
        </div>
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-50 ${
        danger ? "text-red-600 hover:text-red-700" : "text-slate-700"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
function SkeletonGrid() {
  return null as any;
}
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return null as any;
}
