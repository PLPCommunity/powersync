// src/components/AllBoards.tsx
import React, { useEffect, useMemo, useState } from "react";
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

// Your compat firebase export (unchanged file you showed)
import { auth } from "../utils/firebase";
import Login from "../Components/Login";

/* ----------------------------- Types & Config ----------------------------- */

type Board = {
  _id: string;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

const API_BASE =
  ((import.meta as any).env?.VITE_API_BASE as string) || "http://localhost:5000";

/* --------------------------------- Helpers -------------------------------- */

// Fetch wrapper that ALWAYS sends cookies
const api = (path: string, init: RequestInit = {}) =>
  fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });

// Create/refresh a server session cookie from current Firebase user
async function ensureSession() {
  const u = auth.currentUser;
  if (!u) return;
  // force fresh token to avoid "expired" later
  const idToken = await u.getIdToken(true);
  await api("/api/sessionLogin", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });
}

function gradientFromId(id: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const hue1 = (hash >>> 0) % 360;
  const hue2 = (hue1 + 30 + ((hash >>> 8) % 60)) % 360;
  return [`hsl(${hue1}, 92%, 88%)`, `hsl(${hue2}, 92%, 80%)`];
}

function fmtDate(s?: string) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(+d) ? s : d.toLocaleString();
}

/* -------------------------------- Component ------------------------------- */

export default function AllBoards() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(auth.currentUser);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Keep local user state in sync
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (!u) {
        setBoards([]);
        setLoading(false);
        // also clear cookie session on sign out (best effort)
        api("/api/sessionLogout", { method: "POST" }).catch(() => {});
        return;
      }
      // with a user: ensure cookie, sync profile, then load boards
      try {
        await ensureSession();
        await api("/api/users/sync", { method: "POST" }); // upsert profile
      } catch {
        /* ignore */
      }
      try {
        const r = await api("/api/boards");
        const data = await r.json();
        setBoards(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
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

  /* --------------------------------- Actions -------------------------------- */

  async function createBoardAndOpen() {
    if (isCreating) return;
    setIsCreating(true);
    try {
      await ensureSession();
      const res = await api("/api/boards", {
        method: "POST",
        body: JSON.stringify({ name: "Untitled document" }),
      });
      const created = await res.json();
      if (res.ok && created?._id) {
        setBoards((prev) => [created, ...prev]);
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
    const name = next.trim();

    setBoards((prev) => prev.map((b) => (b._id === id ? { ...b, name } : b)));
    try {
      await ensureSession();
      await api(`/api/boards/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      });
    } catch {
      // no-op
    }
  }

  async function duplicateBoard(id: string) {
    const src = boards.find((b) => b._id === id);
    const name = src?.name ? `${src.name} (Copy)` : "Untitled document (Copy)";
    try {
      await ensureSession();
      const res = await api("/api/boards", {
        method: "POST",
        body: JSON.stringify({ name, description: src?.description ?? "" }),
      });
      const created = await res.json();
      if (res.ok) setBoards((prev) => [created, ...prev]);
      else alert(created?.message || "Failed to duplicate");
    } catch {
      // no-op
    }
  }

  async function deleteBoard(id: string) {
    const ok = confirm("Delete this board? This cannot be undone.");
    if (!ok) return;

    const prev = boards;
    setBoards((p) => p.filter((b) => b._id !== id)); // optimistic
    try {
      await ensureSession();
      const res = await api(`/api/boards/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = (res.headers.get("content-type") || "").includes(
          "application/json"
        )
          ? await res.json().catch(() => null)
          : null;
        setBoards(prev);
        alert(payload?.message || `Failed to delete (HTTP ${res.status})`);
      }
    } catch (e: any) {
      setBoards(prev);
      alert(e?.message || "Failed to delete board");
    }
  }

  /* ----------------------------------- UI ----------------------------------- */

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50">
     

        <main className="mx-auto max-w-7xl  pb-24 pt-10 md:pt-52">
          <section className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
              Sign in to start drawing together
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
              A clean, collaborative canvas for sketches, flowcharts, and ideas.
              Create boards, invite teammates, and bring plans to lifefast.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Login />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {/* No credit card needed • Cancel anytime */}
            </p>
          </section>
        </main>

        <footer className="border-t border-slate-200">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-slate-500 sm:flex-row">
            <span>© {new Date().getFullYear()} DrawBoard. All rights reserved.</span>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-slate-700">Privacy</a>
              <a href="#" className="hover:text-slate-700">Terms</a>
              <a href="#" className="hover:text-slate-700">Status</a>
            </div>
          </div>
        </footer>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pt-20">
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
            className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
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

/* ------------------------------- Subcomponents ------------------------------ */

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
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      onClick={onOpen}
      className={`group relative cursor-pointer rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        openMenuId === board._id ? "z-50" : ""
      }`}
    >
      <div
        className="relative h-28 w-full rounded-t-2xl"
        style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}
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
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{board.description}</p>
            ) : (
              <p className="mt-1 text-sm text-slate-400">—</p>
            )}
          </div>

          <div className="relative flex items-center gap-1" onClick={stop}>
            <button
              aria-label="delete board"
              onClick={onDelete}
              className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
              title="Delete"
            >
              <Trash2 className="h-5 w-5" />
            </button>

            <button
              aria-label="board menu"
              onClick={() => setOpenMenuId(openMenuId === board._id ? null : board._id)}
              className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              title="More"
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {openMenuId === board._id && (
              <div className="absolute right-0 top-9 z-50 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white/95 py-1 text-sm shadow-2xl backdrop-blur-md">
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
          <span>{fmtDate(board.updatedAt || board.createdAt)}</span>
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
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white">
          <div className="h-28 rounded-t-2xl bg-slate-100" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-1/2 rounded bg-slate-100" />
            <div className="h-3 w-2/3 rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
      <div className="mx-auto max-w-sm">
        <h3 className="text-lg font-semibold text-slate-900">No boards yet</h3>
        <p className="mt-1 text-sm text-slate-600">
          Create your first board to start sketching, diagramming, and collaborating.
        </p>
        <button
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          New Board
        </button>
      </div>
    </div>
  );
}
