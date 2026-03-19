import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import './index.css';
import Play from './pages/Play';

const Editor = lazy(() => import('./pages/Editor'));

function Nav() {
  return (
    <nav className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <Link to="/play" className="text-lg tracking-tight text-black no-underline" style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>
        Fourbe
      </Link>
      <div className="flex gap-4 text-sm font-medium">
        <Link to="/play" className="text-gray-500 hover:text-black transition-colors">Play</Link>
      </div>
    </nav>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Play />} />
        <Route path="/play" element={<Play />} />
        <Route
          path="/editor"
          element={
            <Suspense fallback={null}>
              <Editor />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
