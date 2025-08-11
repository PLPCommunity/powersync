import React from "react";
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
import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/60 via-white to-white text-slate-800">
      {/* Decorative background blob */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-300/40 via-sky-200/40 to-purple-200/40 blur-3xl" />
      </div>

      {/* Header */}
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm">
            <PencilRuler className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Diagramr</span>
        </div>
        <nav className="hidden items-center gap-6 md:flex">
          <a href="#features" className="text-sm text-slate-600 hover:text-slate-900">
            Features
          </a>
          <a href="#pricing" className="text-sm text-slate-600 hover:text-slate-900">
            Pricing
          </a>
          <a href="#faq" className="text-sm text-slate-600 hover:text-slate-900">
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <a
            href="/board/new"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:from-indigo-500 hover:to-purple-500"
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-5xl px-6 pt-10 text-center md:pt-16">
        <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm">
          <PencilRuler className="h-6 w-6" />
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
          Create Beautiful
          <span className="block bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Diagrams
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
          The ultimate drawing board for creating stunning diagrams, wireframes, and visual concepts. Simple,
          powerful, and built for teams.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/boards"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-purple-500"
          >
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </a>
          <Link to="/boards"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
          >
            <PlayCircle className="h-5 w-5" />
           My Boards
          </Link>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-6xl px-6 pb-16 pt-16">
        <h2 className="mb-8 text-center text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
          Everything you need to create
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-slate-600">
          Powerful features designed to make diagram creation effortless and enjoyable.
        </p>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<PencilRuler className="h-5 w-5" />}
            title="Intuitive Drawing Tools"
            desc="Create beautiful diagrams with rectangles, circles, arrows, and freehand drawing tools."
          />
          <FeatureCard
            icon={<LayoutGrid className="h-5 w-5" />}
            title="Multiple Boards"
            desc="Organize your work across different boards. Create, manage, and switch between projects effortlessly."
          />
          <FeatureCard
            icon={<Pointer className="h-5 w-5" />}
            title="Smart Selection"
            desc="Select, move, and modify shapes with precision. Undo and redo any action with ease."
          />
          <FeatureCard
            icon={<Download className="h-5 w-5" />}
            title="Export & Share"
            desc="Export your diagrams as high quality PNG images and share them with your team."
          />
          <FeatureCard
            icon={<Zap className="h-5 w-5" />}
            title="Lightning Fast"
            desc="Built for performance with smooth interactions and real time drawing capabilities."
          />
          <FeatureCard
            icon={<Users className="h-5 w-5" />}
            title="Team Collaboration"
            desc="Perfect for brainstorming sessions, wireframing, and collaborative diagram creation."
          />
        </div>
      </section>

      {/* Big CTA */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 p-10 text-center text-white shadow-[0_20px_70px_-20px_rgba(79,70,229,0.55)]">
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <h3 className="text-2xl font-bold md:text-3xl">Ready to start creating?</h3>
          <p className="mx-auto mt-2 max-w-2xl text-white/90">
            Join thousands of creators who trust our platform for their visual projects.
          </p>
          <div className="mt-6">
            <a
              href="/boards"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50"
            >
              Start Drawing Now
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-slate-500 md:flex-row">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white">
              <PencilRuler className="h-4 w-4" />
            </div>
            <span>© {new Date().getFullYear()} Diagramr. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="#" className="hover:text-slate-700">Terms</a>
            <a href="#" className="hover:text-slate-700">Privacy</a>
            <a href="#" className="hover:text-slate-700">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">{desc}</p>
    </div>
  );
}
