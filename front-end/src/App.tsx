// src/App.tsx
// import React, { Suspense} from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { HomePage } from "./Components/HomePage";
import { BoardCanvas } from "./routes/BoardCanvas";
import AllBoards from "./Components/AllBoards";
import './App.css';
import Header from "./Components/Header";
import("preline");

// const BoardCanvas = lazy(() => import("./components/BoardCanvas"));

export default function App() {
  return (
    <main>
        <Header/>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/boards" element={<AllBoards />} />
        <Route
          path="/board/:id"
          element={
            // <Suspense fallback={<div className="p-6 text-center text-slate-600">Loading board…</div>}>
            // </Suspense>
              <BoardCanvas />
          }
        />
        <Route
          path="/board/public/:linkId"
          element={<BoardCanvas isPublic={true} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </main>
  );
}
