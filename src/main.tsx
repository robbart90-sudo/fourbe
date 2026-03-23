import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Play from './pages/Play';
import { ComingSoon } from './components/ComingSoon';

const Editor = lazy(() => import('./pages/Editor'));

const PLAYTEST_KEY = 'fourbe-playtest';
const PLAYTEST_CODE = 'fourbe2026';

function checkPlaytestAccess(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get('playtest') === PLAYTEST_CODE) {
    localStorage.setItem(PLAYTEST_KEY, 'true');
    return true;
  }
  return localStorage.getItem(PLAYTEST_KEY) === 'true';
}

const hasAccess = checkPlaytestAccess();

function Nav() {
  return (
    <nav className="border-b border-gray-200 px-4 py-3 flex items-center">
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('fourbe-go-home'))}
        className="text-lg tracking-tight text-black cursor-pointer hover:opacity-70 transition-opacity bg-transparent border-none p-0"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}
      >
        Fourbe
      </button>
    </nav>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {hasAccess ? (
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
    ) : (
      <ComingSoon />
    )}
  </StrictMode>,
);
