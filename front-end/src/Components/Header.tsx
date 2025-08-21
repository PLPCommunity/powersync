import React, { useEffect, useRef, useState } from "react";
import {
    ArrowRight,
    PlayCircle,
    PencilRuler,
    LayoutGrid,
    Pointer,
    Download,
    Zap,
    Users,
  } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Login from "../Components/Login";
import { auth } from "../utils/firebase";
import { useDispatch, useSelector } from "react-redux";
import {logout, selectUser } from "../features/userSlice";

const Header = () => {
    const user = useSelector(selectUser);
    const dispatch = useDispatch();
    const navigate = useNavigate();
  
    const signOutOfApp = () => {
      dispatch(logout);
      auth.signOut();
      window.location.reload();
  
      if (user) {
        auth.signOut();
      }
      navigate("/");
    };
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/60 via-white to-white text-slate-800">
         <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-300/40 via-sky-200/40 to-purple-200/40 blur-3xl" />
      </div>
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm">
            <PencilRuler className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Diagramr</span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          <a
            href="#features"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Features
          </a>
          <a
            href="https://progskill.com"
            target="_blank"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Learn Coding
          </a>
          <a
            href="#faq"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            FAQ
          </a>
        </nav>
        {/* <Login/> */}
        <div className="flex items-center gap-3">
          {!user ? (
            <Login />
          ) : (
            <UserMenu user={user} signOutOfApp={signOutOfApp} />
          )}

          {/* <Login/> */}
        </div>
      </header>
    </div>
  )
}

export default Header

type Props = {
    user: { displayName?: string; email?: string } | null;
    signOutOfApp: () => void;
  };
  
  export  function UserMenu({ user, signOutOfApp }: Props) {
    const [open, setOpen] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
  
    useEffect(() => {
      const onDocClick = (e: MouseEvent) => {
        if (!open) return;
        const t = e.target as Node;
        if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
        setOpen(false);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDocClick);
        document.removeEventListener("keydown", onKey);
      };
    }, [open]);
  
    const initial = user?.displayName?.[0] || user?.email?.[0] || "?";
  
    return (
      <div className="relative inline-flex">
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="bg-[#13ABC4] flex text-sm rounded-full ring-1 ring-black/5 focus:outline-none"
        >
          <span className="w-10 h-10 grid place-items-center font-mono uppercase text-lg text-white border-2 rounded-full cursor-pointer">
            {initial}
          </span>
        </button>
  
        <div
          ref={menuRef}
          role="menu"
          aria-label="User menu"
          className={`absolute right-0 mt-2 w-72 min-w-[16.5rem] bg-white shadow-md rounded-lg p-2 ring-1 ring-black/5 origin-top-right transition
            ${
              open
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95 pointer-events-none"
            }`}
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate("/mydashboard");
            }}
            className="w-full text-left flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-gray-800 hover:bg-gray-100 cursor-pointer"
          >
            My Profile
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate("/contact-us");
            }}
            className="w-full text-left flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-gray-800 hover:bg-gray-100 cursor-pointer"
          >
            Contact Support
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOutOfApp();
            }}
            className="w-full text-left flex items-start gap-x-3.5 py-2 px-3 rounded-md text-sm bg-pink-100 hover:bg-pink-200 text-pink-600 cursor-pointer"
          >
            <div>
              <span className="font-semibold">Sign Out</span>
              <br />
              <span>{!user ? "Guest" : user?.displayName}</span>
            </div>
          </button>
        </div>
      </div>
    );
  }
  