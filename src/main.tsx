import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Play from './pages/Play';
import { ComingSoon } from './components/ComingSoon';

const Editor = lazy(() => import('./pages/Editor'));
const Keylocker = lazy(() => import('./pages/Keylocker'));
const SpyxxingBee = lazy(() => import('./pages/SpyxxingBee'));

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
    <nav className="px-4 pt-3 pb-2">
      <hr className="fb-rule" style={{ marginBottom: 8 }} />
      <div className="flex items-center justify-center">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('fourbe-go-home'))}
          className="tracking-tight text-black cursor-pointer hover:opacity-70 transition-opacity bg-transparent border-none p-0"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22 }}
        >
          Fourbe
        </button>
      </div>
      <hr className="fb-rule" style={{ marginTop: 8 }} />
    </nav>
  );
}

function FourbeApp() {
  if (!hasAccess) return <ComingSoon />;
  return (
    <div className="fourbe-theme" style={{ width: '100vw', marginLeft: 'calc(-50vw + 50%)' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 1rem' }}>
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
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/keylocker"
          element={
            <Suspense fallback={null}>
              <div className="keylocker-theme" style={{ minHeight: '100dvh', width: '100vw', marginLeft: 'calc(-50vw + 50%)' }}>
                <Keylocker />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/spying-bee"
          element={
            <Suspense fallback={null}>
              <SpyxxingBee />
            </Suspense>
          }
        />
        <Route path="/*" element={<FourbeApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
