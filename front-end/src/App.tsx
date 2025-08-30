import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { HomePage } from "./Components/HomePage";
import { BoardCanvas } from "./routes/BoardCanvas";
import AllBoards from "./Components/AllBoards";
import Header from "./Components/Header";
import "./App.css";
import("preline");

// Layout that shows the header
function LayoutWithHeader() {
  return (
    <main>
      <Header />
      <Outlet />
    </main>
  );
}

// Layout without the header (for /boards)
function LayoutNoHeader() {
  return (
    <main>
      <Outlet />
    </main>
  );
}

export default function App() {
  console.log('[App] Rendering App component');
  
  return (
    <Routes>
      <Route element={<LayoutWithHeader />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/boards" element={<AllBoards />} />
      </Route>

      <Route element={<LayoutNoHeader />}>
        <Route path="/board/:id" element={<BoardCanvas />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
