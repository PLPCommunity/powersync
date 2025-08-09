import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App.tsx';
import { BoardCanvas } from './routes/BoardCanvas.tsx';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/boards/:id', element: <BoardCanvas /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
