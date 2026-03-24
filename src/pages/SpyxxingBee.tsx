import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import WordSearch from '@blex41/word-search';

interface WordPath {
  x: number;
  y: number;
}

interface PlacedWord {
  word: string;
  clean: string;
  path: WordPath[];
}

type CellState = 'hidden' | 'revealed' | 'found' | 'adjacent';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WordSearchInstance = any;

interface Puzzle {
  theme: string;
  words: string[];
}

const PUZZLES: Puzzle[] = [
  { theme: 'Breakfast', words: ['BACON', 'EGGS', 'TOAST', 'COFFEE', 'WAFFLE', 'CEREAL'] },
  { theme: 'US Presidents', words: ['LINCOLN', 'OBAMA', 'NIXON', 'ADAMS', 'GRANT', 'TYLER'] },
  { theme: 'Beach', words: ['TOWEL', 'WAVES', 'SHELLS', 'SAND', 'SUNBURN', 'COOLER'] },
  { theme: 'US States', words: ['TEXAS', 'OHIO', 'MAINE', 'ALASKA', 'IDAHO', 'NEVADA'] },
  { theme: 'Carmakers', words: ['TOYOTA', 'HONDA', 'FORD', 'TESLA', 'VOLVO', 'SUBARU'] },
  { theme: 'Zoo Animals', words: ['TIGER', 'ZEBRA', 'PANDA', 'MONKEY', 'OTTER', 'HIPPO'] },
];
const QWERTY_ROWS = [
  'QWERTYUIOP'.split(''),
  'ASDFGHJKL'.split(''),
  'ZXCVBNM'.split(''),
];
const HTP_SEEN_KEY = 'spyxxing-bee-played-before';
const ROWS = 10;
const COLS = 10;
const MAX_SELECTED = 3;
const REVEAL_DURATION = 8000;
const REDACT_BAR_MS = 200;
const REDACT_STAGGER_MS = 35;
const TAP_TIMEOUT = 3000;

interface CellCoord {
  r: number;
  c: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function generateGrid(dictionary: string[]) {
  const ws: WordSearchInstance = new WordSearch({
    cols: COLS,
    rows: ROWS,
    disabledDirections: ["NW", "NE", "SW", "SE"],
    dictionary,
    maxWords: 20,
    backwardsProbability: 0.5,
    upperCase: true,
  });

  console.log('Placed words:', ws.data.words);

  const placedCleans = new Set(ws.data.words.map((w: PlacedWord) => w.clean));
  const unplaced = dictionary.filter(w => !placedCleans.has(w));
  if (unplaced.length > 0) {
    console.warn('Unplaced words:', unplaced);
  }

  return { grid: ws.data.grid as string[][], words: ws.data.words as PlacedWord[] };
}

function GameBoardIcon({ size = 32 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={size} height={size}>
      {/* Outer frame with hard-edge shadow */}
      <rect x="2" y="2" width="28" height="28" rx="1" fill="#1A1A1A" />
      <rect x="0" y="0" width="28" height="28" rx="1" fill="#F5F0E8" stroke="#1A1A1A" strokeWidth="1" />
      {/* 3×3 grid — X cells with center S */}
      {[[0,0],[1,0],[2,0],[0,1],[2,1],[0,2],[1,2],[2,2]].map(([col, row]) => {
        const cx = 2 + col * 8.5;
        const cy = 2 + row * 8.5;
        return (
          <g key={`${col}-${row}`}>
            <rect x={cx} y={cy} width="7" height="7" rx="1" fill="#F5F0E8" />
            <text x={cx + 3.5} y={cy + 5.2} fontFamily="Arial,sans-serif" fontWeight="bold" fontSize="5.5" fill="#1A1A1A" fillOpacity="0.35" textAnchor="middle">X</text>
          </g>
        );
      })}
      {/* Center cell: S in orange-red */}
      <rect x="10.5" y="10.5" width="7" height="7" rx="1" fill="#E8530E" />
      <text x="14" y="15.7" fontFamily="Arial,sans-serif" fontWeight="bold" fontSize="5.5" fill="#fff" textAnchor="middle">S</text>
    </svg>
  );
}

export default function SpyxxingBee() {
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [words, setWords] = useState<PlacedWord[]>([]);
  const [foundWords, setFoundWords] = useState<Set<string>>(new Set());
  const [cellStates, setCellStates] = useState<CellState[][]>([]);
  const [selectedLetters, setSelectedLetters] = useState<string[]>([]);
  const [redactingCells, setRedactingCells] = useState<Map<string, number>>(new Map());
  const [tapSequence, setTapSequence] = useState<CellCoord[]>([]);
  const [dragPath, setDragPath] = useState<CellCoord[]>([]);
  const [failingCells, setFailingCells] = useState<Set<string>>(new Set());
  const [flareSet, setFlareSet] = useState<Set<string>>(new Set());
  const [elapsed, setElapsed] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [finalTime, setFinalTime] = useState(0);
  const [revealActive, setRevealActive] = useState(false);
  const [phase, setPhase] = useState<'start' | 'playing'>('start');
  const [showHtp, setShowHtp] = useState(() => !localStorage.getItem(HTP_SEEN_KEY));
  const [trailPoints, setTrailPoints] = useState<{ x: number; y: number }[]>([]);
  const [boardPulse, setBoardPulse] = useState(false);
  const [foundWordPaths, setFoundWordPaths] = useState<{ word: string; cells: { r: number; c: number }[] }[]>([]);
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wordsRef = useRef<PlacedWord[]>([]);
  const foundWordsRef = useRef<Set<string>>(new Set());
  const tapSequenceRef = useRef<CellCoord[]>([]);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const gridPanelRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragPathRef = useRef<CellCoord[]>([]);
  const pointerStartRef = useRef<{ x: number; y: number; r: number; c: number } | null>(null);
  const scoredMidSwipeRef = useRef(false);

  const DRAG_THRESHOLD = 5;

  const puzzleIndexRef = useRef(puzzleIndex);
  puzzleIndexRef.current = puzzleIndex;

  const initGame = useCallback(() => {
    const puzzle = PUZZLES[puzzleIndexRef.current];
    const { grid: newGrid, words: newWords } = generateGrid(puzzle.words);
    setGrid(newGrid);
    setWords(newWords);
    wordsRef.current = newWords;
    setCellStates(
      Array.from({ length: ROWS }, () =>
        Array.from({ length: COLS }, () => 'hidden' as CellState)
      )
    );
    setFoundWords(new Set());
    foundWordsRef.current = new Set();
    setSelectedLetters([]);
    setTapSequence([]);
    tapSequenceRef.current = [];
    setDragPath([]);
    dragPathRef.current = [];
    setFailingCells(new Set());
    setRedactingCells(new Map());
    setFlareSet(new Set());
    setFoundWordPaths([]);
    setRevealActive(false);
    setElapsed(0);
    setGameOver(false);
    setFinalTime(0);
    pointerStartRef.current = null;
    isDraggingRef.current = false;

    // Clear any lingering timers
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (failTimerRef.current) clearTimeout(failTimerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);

    // Start timer
    intervalRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
  }, []);

  const switchPuzzle = useCallback((idx: number) => {
    setPuzzleIndex(idx);
    puzzleIndexRef.current = idx;
  }, []);

  // Favicon + title + OG swap
  useEffect(() => {
    const link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    const prev = link?.href;
    if (link) link.href = '/spyxxing-bee-favicon.svg';
    document.title = 'Spying Bee';

    const ogTags: Record<string, string> = {
      'og:title': 'Spying Bee',
      'og:description': 'Word find with a secret twist.',
      'og:image': '/og-spyxxing-bee.png',
    };
    const prevOg: Record<string, string> = {};
    for (const [prop, value] of Object.entries(ogTags)) {
      const el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
      if (el) { prevOg[prop] = el.content; el.content = value; }
    }

    return () => {
      if (link && prev) link.href = prev;
      for (const [prop, value] of Object.entries(prevOg)) {
        const el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
        if (el) el.content = value;
      }
    };
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (failTimerRef.current) clearTimeout(failTimerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Keep foundWordsRef in sync + check win
  useEffect(() => {
    foundWordsRef.current = foundWords;
    if (words.length > 0 && foundWords.size === words.length) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setFinalTime(elapsed);
      setTimeout(() => setGameOver(true), 600);
    }
  }, [foundWords, words.length, elapsed]);

  // Compute SVG trail points when active path changes
  useLayoutEffect(() => {
    const g = gridRef.current;
    if (!g) { setTrailPoints([]); return; }
    const activePath = dragPath.length > 0 ? dragPath : tapSequence;
    if (activePath.length < 2) { setTrailPoints([]); return; }

    const gridRect = g.getBoundingClientRect();
    const pts = activePath.map(({ r, c }) => {
      const cell = g.querySelector(`[data-row="${r}"][data-col="${c}"]`) as HTMLElement | null;
      if (!cell) return null;
      const cr = cell.getBoundingClientRect();
      return { x: cr.left + cr.width / 2 - gridRect.left, y: cr.top + cr.height / 2 - gridRect.top };
    }).filter(Boolean) as { x: number; y: number }[];
    setTrailPoints(pts);
  }, [dragPath, tapSequence]);

  // ── Shared helpers ──

  const checkWordMatch = useCallback((sequence: CellCoord[]): PlacedWord | null => {
    const reversed = [...sequence].reverse();
    for (const word of wordsRef.current) {
      if (foundWordsRef.current.has(word.clean)) continue;
      if (word.path.length !== sequence.length) continue;
      const fwd = word.path.every(
        (p, i) => p.y === sequence[i].r && p.x === sequence[i].c
      );
      if (fwd) return word;
      const rev = word.path.every(
        (p, i) => p.y === reversed[i].r && p.x === reversed[i].c
      );
      if (rev) return word;
    }
    return null;
  }, []);

  const fireWordFound = useCallback((matched: PlacedWord) => {
    const adjacentKeys = new Set<string>();
    for (const p of matched.path) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = p.y + dr;
          const nc = p.x + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
            adjacentKeys.add(`${nr},${nc}`);
          }
        }
      }
    }
    const foundKeys = new Set(matched.path.map(p => `${p.y},${p.x}`));

    setCellStates(prev =>
      prev.map((row, ri) =>
        row.map((state, ci) => {
          const key = `${ri},${ci}`;
          if (foundKeys.has(key)) return 'found';
          if (adjacentKeys.has(key) && state !== 'found') return 'adjacent';
          return state;
        })
      )
    );

    setFlareSet(foundKeys);
    setTimeout(() => setFlareSet(new Set()), 500);
    setFoundWords(prev => new Set([...prev, matched.clean]));

    // Board pulse
    setBoardPulse(true);
    setTimeout(() => setBoardPulse(false), 300);

    // Store word path for rounded rectangle overlay
    setFoundWordPaths(prev => [...prev, {
      word: matched.clean,
      cells: matched.path.map(p => ({ r: p.y, c: p.x })),
    }]);

    console.log('Found word:', matched.clean);
  }, []);

  const triggerFail = useCallback((cells: CellCoord[]) => {
    if (cells.length === 0) return;
    const keys = new Set(cells.map(p => `${p.r},${p.c}`));
    setFailingCells(keys);
    if (failTimerRef.current) clearTimeout(failTimerRef.current);
    failTimerRef.current = setTimeout(() => setFailingCells(new Set()), 300);
  }, []);

  const isOnAxis = useCallback((sequence: CellCoord[]): boolean => {
    if (sequence.length <= 2) return true;
    // Determine axis from first two cells
    const isHorizontal = sequence[1].r === sequence[0].r;
    const isVertical = sequence[1].c === sequence[0].c;
    if (!isHorizontal && !isVertical) return false; // diagonal — not allowed
    for (let i = 2; i < sequence.length; i++) {
      const dr = Math.abs(sequence[i].r - sequence[i - 1].r);
      const dc = Math.abs(sequence[i].c - sequence[i - 1].c);
      if (isHorizontal && (sequence[i].r !== sequence[0].r || dc !== 1)) return false;
      if (isVertical && (sequence[i].c !== sequence[0].c || dr !== 1)) return false;
    }
    return true;
  }, []);

  // ── Tap mechanic ──

  const handleCellTap = useCallback((r: number, c: number) => {
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }

    const prev = tapSequenceRef.current;
    let newSeq: CellCoord[];

    if (prev.length === 0) {
      newSeq = [{ r, c }];
    } else {
      const last = prev[prev.length - 1];
      const dr = r - last.r;
      const dc = c - last.c;
      const isAdj = (Math.abs(dr) + Math.abs(dc)) === 1; // Cardinal only, no diagonals

      if (!isAdj) {
        newSeq = [{ r, c }];
      } else {
        const candidate = [...prev, { r, c }];
        newSeq = isOnAxis(candidate) ? candidate : [{ r, c }];
      }
    }

    const matched = checkWordMatch(newSeq);
    if (matched) {
      fireWordFound(matched);
      tapSequenceRef.current = [];
      setTapSequence([]);
      return;
    }

    tapSequenceRef.current = newSeq;
    setTapSequence(newSeq);

    tapTimerRef.current = setTimeout(() => {
      tapSequenceRef.current = [];
      setTapSequence([]);
    }, TAP_TIMEOUT);
  }, [checkWordMatch, isOnAxis, fireWordFound, triggerFail]);

  // ── Drag/swipe mechanic ──

  const getCellFromPoint = useCallback((x: number, y: number): CellCoord | null => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const cell = (el as HTMLElement).closest('[data-row]') as HTMLElement | null;
    if (!cell) return null;
    const r = parseInt(cell.dataset.row!, 10);
    const c = parseInt(cell.dataset.col!, 10);
    if (isNaN(r) || isNaN(c)) return null;
    return { r, c };
  }, []);

  const handleGridPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const cell = getCellFromPoint(e.clientX, e.clientY);
    if (!cell) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();

    pointerStartRef.current = { x: e.clientX, y: e.clientY, r: cell.r, c: cell.c };
    isDraggingRef.current = false;
    scoredMidSwipeRef.current = false;
    dragPathRef.current = [{ r: cell.r, c: cell.c }];
    setDragPath([{ r: cell.r, c: cell.c }]);
  }, [getCellFromPoint]);

  const handleGridPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    e.preventDefault();

    const { x: startX, y: startY } = pointerStartRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!isDraggingRef.current && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
      isDraggingRef.current = true;
      // Clear tap sequence — swipe takes over
      if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
      tapSequenceRef.current = [];
      setTapSequence([]);
    }

    if (!isDraggingRef.current) return;

    const cell = getCellFromPoint(e.clientX, e.clientY);
    if (!cell) return; // Pointer in gap or off-grid — just ignore, keep path

    const path = dragPathRef.current;
    const last = path[path.length - 1];
    if (cell.r === last.r && cell.c === last.c) return; // Still same cell

    const dr = Math.abs(cell.r - last.r);
    const dc = Math.abs(cell.c - last.c);
    if (dr > 1 || dc > 1) return; // Not adjacent
    if (dr > 0 && dc > 0) return; // No diagonals

    // Axis lock: after 2+ cells, only allow movement along the established axis
    if (path.length >= 2) {
      const isHorizontal = path[1].r === path[0].r;
      const isVertical = path[1].c === path[0].c;
      if (isHorizontal && cell.r !== path[0].r) return;
      if (isVertical && cell.c !== path[0].c) return;
    }

    // Backtrack: moving back to previous cell undoes the last step
    if (path.length >= 2) {
      const prev = path[path.length - 2];
      if (cell.r === prev.r && cell.c === prev.c) {
        const newPath = path.slice(0, -1);
        dragPathRef.current = newPath;
        setDragPath(newPath);
        return;
      }
    }

    // Ignore if cell is already in the path (no loops)
    if (path.some(p => p.r === cell.r && p.c === cell.c)) return;

    const newPath = [...path, { r: cell.r, c: cell.c }];

    // Check for word match instantly on every new cell
    const matched = checkWordMatch(newPath);
    if (matched) {
      fireWordFound(matched);
      scoredMidSwipeRef.current = true;
      // Start a new path from the current cell so player can chain
      const fresh = [{ r: cell.r, c: cell.c }];
      dragPathRef.current = fresh;
      setDragPath(fresh);
      // Reset pointer start so drag threshold doesn't re-trigger
      pointerStartRef.current = { x: e.clientX, y: e.clientY, r: cell.r, c: cell.c };
      return;
    }

    dragPathRef.current = newPath;
    setDragPath(newPath);
  }, [getCellFromPoint, checkWordMatch, fireWordFound]);

  const handleGridPointerUp = useCallback((e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;

    const startCell = pointerStartRef.current;
    const wasDragging = isDraggingRef.current;
    const scoredMidSwipe = scoredMidSwipeRef.current;

    pointerStartRef.current = null;
    isDraggingRef.current = false;
    scoredMidSwipeRef.current = false;

    if (scoredMidSwipe) {
      // Word already scored mid-swipe — just clear any partial new path
      dragPathRef.current = [];
      setDragPath([]);
    } else if (wasDragging) {
      const path = dragPathRef.current;
      const matched = checkWordMatch(path);
      if (matched) {
        fireWordFound(matched);
      } else if (path.length > 1) {
        triggerFail(path);
      }
      dragPathRef.current = [];
      setDragPath([]);
    } else {
      // Was a tap — clear drag visual and handle as tap
      dragPathRef.current = [];
      setDragPath([]);
      handleCellTap(startCell.r, startCell.c);
    }

    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }, [checkWordMatch, fireWordFound, triggerFail, handleCellTap]);

  const handleGridPointerCancel = useCallback(() => {
    pointerStartRef.current = null;
    isDraggingRef.current = false;
    scoredMidSwipeRef.current = false;
    dragPathRef.current = [];
    setDragPath([]);
  }, []);

  const toggleLetter = useCallback((letter: string) => {
    setSelectedLetters(prev => {
      if (prev.includes(letter)) {
        return prev.filter(l => l !== letter);
      }
      if (prev.length >= MAX_SELECTED) {
        return prev;
      }
      return [...prev, letter];
    });
  }, []);

  const fireReveal = useCallback(() => {
    if (!grid || selectedLetters.length !== MAX_SELECTED) return;

    const selectedSet = new Set(selectedLetters);
    const revealSet = new Set<string>();

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (selectedSet.has(grid[r][c])) {
          revealSet.add(`${r},${c}`);
          if (r > 0) revealSet.add(`${r - 1},${c}`);
          if (r < ROWS - 1) revealSet.add(`${r + 1},${c}`);
          if (c > 0) revealSet.add(`${r},${c - 1}`);
          if (c < COLS - 1) revealSet.add(`${r},${c + 1}`);
        }
      }
    }

    setCellStates(prev =>
      prev.map((row, ri) =>
        row.map((state, ci) => {
          if (state === 'found' || state === 'adjacent') return state;
          if (revealSet.has(`${ri},${ci}`)) return 'revealed';
          return state;
        })
      )
    );

    setRedactingCells(new Map());
    setRevealActive(true);
    setSelectedLetters([]);

    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

    // After the reveal window, trigger redaction bar sweep
    revealTimerRef.current = setTimeout(() => {
      // Collect revealed cells and sort by position for cascade
      const revealedCoords: { r: number; c: number; order: number }[] = [];
      setCellStates(prev => {
        prev.forEach((row, ri) =>
          row.forEach((state, ci) => {
            if (state === 'revealed') {
              revealedCoords.push({ r: ri, c: ci, order: ri + ci });
            }
          })
        );
        return prev;
      });

      // Sort by row+col for top-left to bottom-right cascade
      revealedCoords.sort((a, b) => a.order - b.order);

      // Assign staggered delays
      const delays = new Map<string, number>();
      revealedCoords.forEach((coord, i) => {
        delays.set(`${coord.r},${coord.c}`, i * REDACT_STAGGER_MS);
      });
      setRedactingCells(delays);

      // After all bars complete, flip cells to hidden
      const maxDelay = revealedCoords.length * REDACT_STAGGER_MS + REDACT_BAR_MS;
      fadeTimerRef.current = setTimeout(() => {
        setCellStates(prev =>
          prev.map(row =>
            row.map(state => (state === 'revealed' ? 'hidden' : state))
          )
        );
        setRedactingCells(new Map());
        setRevealActive(false);
      }, maxDelay);
    }, REVEAL_DURATION);
  }, [grid, selectedLetters]);

  const startGame = useCallback(() => {
    initGame();
    setPhase('playing');
    if (!localStorage.getItem(HTP_SEEN_KEY)) {
      localStorage.setItem(HTP_SEEN_KEY, '1');
    }
    setShowHtp(false);
  }, [initGame]);

  const closeHtp = useCallback(() => {
    setShowHtp(false);
    localStorage.setItem(HTP_SEEN_KEY, '1');
  }, []);

  // ── Start Screen ──
  if (phase === 'start') {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center pb-12 relative"
        style={{
          background: '#FFFFFF',
          fontFamily: "'Inter', sans-serif",
          width: '100vw',
          marginLeft: 'calc(-50vw + 50%)',
          padding: '24px 16px',
        }}
      >
        {/* Help button — top right */}
        {!showHtp && (
          <button
            onClick={() => setShowHtp(true)}
            className="cursor-pointer"
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: '1.1rem',
              color: '#1A1A1A',
              background: '#F5F0E8',
              border: '1px solid #1A1A1A',
              borderRadius: 3,
              boxShadow: '2px 2px 0px #1A1A1A',
              cursor: 'pointer',
              transition: 'all 0.1s ease',
            }}
          >
            ?
          </button>
        )}

        {/* Icon */}
        <div style={{ marginBottom: 20 }}>
          <GameBoardIcon size={64} />
        </div>

        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div style={{ width: 140, height: 6, background: '#E8530E' }} />
          <div
            style={{
              fontFamily: "'Archivo Black', sans-serif",
              fontSize: 48,
              color: '#1A1A1A',
              letterSpacing: '-0.08em',
              lineHeight: 1,
              display: 'flex',
            }}
          >
            <span>SPY</span>
            <span style={{ color: '#E8530E' }}>XX</span>
            <span>ING BEE</span>
          </div>
          <div style={{ width: 140, height: 6, background: '#E8530E' }} />
        </div>

        {/* Theme preview */}
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 'clamp(18px, 4vw, 22px)',
            fontWeight: 700,
            color: '#1A1A1A',
            opacity: 0.5,
            marginTop: 28,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {PUZZLES[puzzleIndex].theme} — {PUZZLES[puzzleIndex].words.length} words
        </p>

        {/* How to Play */}
        {showHtp && (
          <div
            style={{
              marginTop: 36,
              maxWidth: 440,
              padding: '0 12px',
            }}
          >
            {/* Flavor text */}
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 'clamp(16px, 3.5vw, 20px)',
                fontWeight: 400,
                color: '#1A1A1A',
                opacity: 0.45,
                lineHeight: 1.7,
                textAlign: 'center',
                margin: '0 0 28px',
              }}
            >
              The enemy scrambled your secret word scrambler. Ironic!
              <br />
              Good thing a great spy never forgets their scrambling de-scrambler.
            </p>

            {/* Instructions */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              {[
                ['Guess', 'words that fit the theme.'],
                ['Select', 'three letters to reveal where they hide.'],
                ['Swipe', 'across the grid to trace words you\u2019ve found.'],
                ['Race', 'the clock \u2014 your time is your score.'],
              ].map(([bold, rest]) => (
                <p
                  key={bold}
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 'clamp(18px, 4vw, 24px)',
                    fontWeight: 500,
                    color: '#1A1A1A',
                    lineHeight: 1.6,
                    margin: 0,
                    textAlign: 'center',
                  }}
                >
                  <strong style={{ color: '#E8530E', fontWeight: 700 }}>{bold}</strong>{' '}
                  {rest}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Play button */}
        <button
          onClick={startGame}
          className="cursor-pointer spyxxing-play-btn"
          style={{
            fontFamily: "'Archivo Black', sans-serif",
            fontSize: 'clamp(1.1rem, 4vw, 1.4rem)',
            letterSpacing: '0.06em',
            marginTop: showHtp ? 40 : 32,
            padding: '18px 48px',
            minWidth: 'min(100%, 280px)',
            background: '#1A1A1A',
            color: '#FFFFFF',
            border: '2px solid #1A1A1A',
            borderRadius: 3,
            boxShadow: '4px 4px 0px #1A1A1A',
            cursor: 'pointer',
            transition: 'all 0.1s ease',
          }}
        >
          PLAY
        </button>

        {/* Puzzle selector — start page */}
        <div
          style={{
            marginTop: 32,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 8,
            maxWidth: 400,
          }}
        >
          {PUZZLES.map((p, i) => (
            <button
              key={p.theme}
              onClick={() => switchPuzzle(i)}
              className="cursor-pointer"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                fontSize: '0.75rem',
                letterSpacing: '0.04em',
                padding: '8px 14px',
                background: i === puzzleIndex ? '#E8530E' : '#F5F0E8',
                color: i === puzzleIndex ? '#FFFFFF' : '#1A1A1A',
                border: '1px solid #1A1A1A',
                borderRadius: 3,
                boxShadow: i === puzzleIndex ? 'none' : '2px 2px 0px #1A1A1A',
                transform: i === puzzleIndex ? 'translate(2px, 2px)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.1s ease',
              }}
            >
              {p.theme.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!grid) return null;

  // Results screen
  if (gameOver) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center pb-12 relative"
        style={{
          background: '#FFFFFF',
          fontFamily: "'Inter', sans-serif",
          width: '100vw',
          marginLeft: 'calc(-50vw + 50%)',
        }}
      >
        {/* Bass accent */}
        <div style={{ width: 48, height: 5, background: '#E8530E', marginBottom: 20 }} />

        <h1
          style={{
            fontFamily: "'Archivo Black', sans-serif",
            fontSize: '2.2rem',
            lineHeight: 1,
            color: '#1A1A1A',
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          DECODED
        </h1>

        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '0.85rem',
            fontWeight: 500,
            color: '#1A1A1A',
            opacity: 0.5,
            marginTop: 8,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {PUZZLES[puzzleIndex].theme} — {words.length} words
        </p>

        {/* Final time */}
        <div
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: '3.5rem',
            color: '#E8530E',
            marginTop: 24,
            lineHeight: 1,
          }}
        >
          {formatTime(finalTime)}
        </div>

        {/* Word list */}
        <div
          style={{
            marginTop: 32,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '8px 16px',
            maxWidth: 400,
          }}
        >
          {words.map(w => (
            <span
              key={w.clean}
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: '1.3rem',
                color: '#1A1A1A',
                fontWeight: 700,
              }}
            >
              {w.clean}
            </span>
          ))}
        </div>

        {/* Play Again */}
        <button
          onClick={initGame}
          className="cursor-pointer"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: '0.85rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginTop: 40,
            padding: '12px 36px',
            background: '#1A1A1A',
            color: '#FFFFFF',
            border: '2px solid #1A1A1A',
            borderRadius: 0,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          PLAY AGAIN
        </button>

        {/* Puzzle selector — results page */}
        <div
          style={{
            marginTop: 24,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 6,
            maxWidth: 380,
          }}
        >
          {PUZZLES.map((p, i) => (
            <button
              key={p.theme}
              onClick={() => { switchPuzzle(i); setTimeout(initGame, 0); }}
              className="cursor-pointer"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                fontSize: '0.7rem',
                letterSpacing: '0.04em',
                padding: '5px 10px',
                background: i === puzzleIndex ? '#E8530E' : 'transparent',
                color: i === puzzleIndex ? '#FFFFFF' : '#1A1A1A',
                opacity: i === puzzleIndex ? 1 : 0.45,
                border: i === puzzleIndex ? '1px solid #E8530E' : '1px solid #1A1A1A',
                borderRadius: 2,
                cursor: 'pointer',
                transition: 'all 0.1s ease',
              }}
            >
              {p.theme.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const canSubmit = selectedLetters.length === MAX_SELECTED && !revealActive;
  const activeSet = new Set([
    ...tapSequence.map(t => `${t.r},${t.c}`),
    ...dragPath.map(t => `${t.r},${t.c}`),
  ]);
  const activePath = dragPath.length > 0 ? dragPath : tapSequence;

  return (
    <div
      className="min-h-screen flex flex-col items-center pt-10 pb-12 relative"
      style={{
        background: '#FFFFFF',
        fontFamily: "'Inter', sans-serif",
        width: '100vw',
        marginLeft: 'calc(-50vw + 50%)',
      }}
    >
      {/* Help button — top right */}
      <button
        onClick={() => setShowHtp(true)}
        className="cursor-pointer"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Inter', sans-serif",
          fontWeight: 700,
          fontSize: '1.1rem',
          color: '#1A1A1A',
          background: '#F5F0E8',
          border: '1px solid #1A1A1A',
          borderRadius: 3,
          boxShadow: '2px 2px 0px #1A1A1A',
          cursor: 'pointer',
          transition: 'all 0.1s ease',
        }}
      >
        ?
      </button>

      {/* How to Play modal */}
      {showHtp && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) closeHtp(); }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              border: '2px solid #1A1A1A',
              borderRadius: 3,
              boxShadow: '6px 6px 0px #1A1A1A',
              padding: '28px 24px',
              maxWidth: 380,
              width: '100%',
              position: 'relative',
            }}
          >
            <button
              onClick={closeHtp}
              className="cursor-pointer"
              style={{
                position: 'absolute',
                top: 10,
                right: 12,
                background: 'none',
                border: 'none',
                fontSize: '1.4rem',
                color: '#1A1A1A',
                opacity: 0.4,
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              &times;
            </button>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '0.85rem',
                fontWeight: 400,
                color: '#1A1A1A',
                opacity: 0.45,
                lineHeight: 1.7,
                textAlign: 'center',
                margin: '0 0 20px',
              }}
            >
              The enemy scrambled your secret word scrambler. Ironic!
              <br />
              Good thing a great spy never forgets their scrambling de-scrambler.
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                marginBottom: 20,
              }}
            >
              {[
                ['Guess', 'words that fit the theme.'],
                ['Select', 'three letters to reveal where they hide.'],
                ['Swipe', 'across the grid to trace words you\u2019ve found.'],
                ['Race', 'the clock \u2014 your time is your score.'],
              ].map(([bold, rest]) => (
                <p
                  key={bold}
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '0.95rem',
                    fontWeight: 500,
                    color: '#1A1A1A',
                    lineHeight: 1.6,
                    margin: 0,
                    textAlign: 'center',
                  }}
                >
                  <strong style={{ color: '#E8530E', fontWeight: 700 }}>{bold}</strong>{' '}
                  {rest}
                </p>
              ))}
            </div>
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={closeHtp}
                className="cursor-pointer"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '10px 32px',
                  background: '#1A1A1A',
                  color: '#FFFFFF',
                  border: '2px solid #1A1A1A',
                  borderRadius: 3,
                  boxShadow: '3px 3px 0px #1A1A1A',
                  cursor: 'pointer',
                  transition: 'all 0.1s ease',
                }}
              >
                GOT IT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logo */}
      <div className="flex flex-col items-center gap-3 mb-2">
        <div style={{ width: 140, height: 6, background: '#E8530E' }} />
        <div
          style={{
            fontFamily: "'Archivo Black', sans-serif",
            fontSize: 48,
            color: '#1A1A1A',
            letterSpacing: '-0.08em',
            lineHeight: 1,
            display: 'flex',
          }}
        >
          <span>SPY</span>
          <span style={{ color: '#E8530E' }}>XX</span>
          <span>ING BEE</span>
        </div>
        <div style={{ width: 140, height: 6, background: '#E8530E' }} />
      </div>

      {/* Theme + word count */}
      <p
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '0.85rem',
          fontWeight: 500,
          color: '#1A1A1A',
          opacity: 0.5,
          marginTop: 6,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {PUZZLES[puzzleIndex].theme} — {words.length} words
      </p>

      {/* Progress row: found words (left) | counter + timer (center) | found words (right) */}
      {(() => {
        const foundList = words.filter(w => foundWords.has(w.clean));
        const half = Math.ceil(words.length / 2);
        const leftWords = foundList.slice(0, half);
        const rightWords = foundList.slice(half);
        return (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: 'min(calc(100vw - 24px), 440px)',
              marginTop: 4,
              marginBottom: 12,
              minHeight: 56,
            }}
          >
            {/* Left zone */}
            <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              {leftWords.map(w => (
                <span
                  key={w.clean}
                  style={{
                    fontFamily: "'Archivo Black', sans-serif",
                    fontSize: '0.8rem',
                    color: '#E8530E',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    lineHeight: 1.3,
                  }}
                >
                  {w.clean}
                </span>
              ))}
            </div>
            {/* Center: counter + timer */}
            <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  color: foundWords.size > 0 ? '#E8530E' : '#1A1A1A',
                  opacity: foundWords.size > 0 ? 1 : 0.35,
                  margin: 0,
                }}
              >
                {foundWords.size} / {words.length} found
              </p>
              <div
                style={{
                  fontFamily: "'VT323', monospace",
                  fontSize: '1.8rem',
                  color: '#1A1A1A',
                  opacity: 0.7,
                  marginTop: 4,
                  lineHeight: 1,
                }}
              >
                {formatTime(elapsed)}
              </div>
            </div>
            {/* Right zone */}
            <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              {rightWords.map(w => (
                <span
                  key={w.clean}
                  style={{
                    fontFamily: "'Archivo Black', sans-serif",
                    fontSize: '0.8rem',
                    color: '#E8530E',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    lineHeight: 1.3,
                  }}
                >
                  {w.clean}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Grid panel */}
      <div
        ref={gridPanelRef}
        className={`spyxxing-grid-panel${boardPulse ? ' board-pulse' : ''}`}
        style={{
          background: '#F5F0E8',
          padding: 'clamp(6px, 2vw, 16px)',
          border: '2px solid #1A1A1A',
          borderRadius: 3,
          boxShadow: '5px 5px 0px #1A1A1A, inset 1px 1px 0px #E8E0D4',
          width: 'min(calc(100vw - 24px), 440px)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          ref={gridRef}
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gap: 0,
            touchAction: 'none',
            cursor: 'crosshair',
            position: 'relative',
          }}
          onPointerDown={handleGridPointerDown}
          onPointerMove={handleGridPointerMove}
          onPointerUp={handleGridPointerUp}
          onPointerCancel={handleGridPointerCancel}
        >
          {grid.map((row, ri) =>
            row.map((letter, ci) => {
              const state = cellStates[ri]?.[ci] ?? 'hidden';
              const isFound = state === 'found';
              const isAdjacent = state === 'adjacent';
              const isRevealed = state === 'revealed';
              const isVisible = isRevealed || isFound || isAdjacent;
              const cellKey = `${ri},${ci}`;
              const isActive = activeSet.has(cellKey);
              const isFailing = failingCells.has(cellKey);
              const isFlaring = flareSet.has(cellKey);
              const redactDelay = redactingCells.get(cellKey);
              const isRedacting = redactDelay !== undefined;
              const pathIndex = isActive
                ? activePath.findIndex(t => t.r === ri && t.c === ci)
                : -1;

              let cellColor: string;
              let cellOpacity = 1;
              let fontWeight: number | string = 400;

              if (isFlaring) {
                cellColor = '#E8530E';
                fontWeight = 700;
              } else if (isActive) {
                cellColor = '#E8530E';
                fontWeight = 700;
                cellOpacity = 1;
              } else if (isFound) {
                cellColor = '#1A1A1A';
                fontWeight = 700;
              } else if (isAdjacent) {
                cellColor = '#E8530E';
                cellOpacity = 0.85;
                fontWeight = 600;
              } else if (isRevealed) {
                cellColor = '#E8530E';
                fontWeight = 700;
              } else {
                cellColor = '#1A1A1A';
                cellOpacity = revealActive ? 0.2 : 0.35;
              }

              return (
                <div
                  key={`${ri}-${ci}`}
                  data-row={ri}
                  data-col={ci}
                  className="relative select-none"
                  style={{
                    fontFamily: "'VT323', monospace",
                    aspectRatio: '1',
                    minWidth: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'clamp(24px, 6vw, 32px)',
                    padding: 1,
                    touchAction: 'none',
                    color: cellColor,
                    fontWeight,
                    opacity: cellOpacity,
                    transition: isFlaring
                      ? 'color 0.5s ease'
                      : 'opacity 0.3s ease',
                    background: isFailing
                      ? 'rgba(232, 83, 14, 0.25)'
                      : isActive
                        ? 'rgba(232, 83, 14, 0.12)'
                        : 'transparent',
                    animation: isFailing
                      ? 'fail-flash 0.3s ease-out'
                      : isFlaring
                        ? 'flare-bass 0.5s ease-out forwards'
                        : 'none',
                  }}
                >
                  {isVisible ? letter : 'X'}
                  {/* Redaction bar overlay */}
                  {isRedacting && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        height: '100%',
                        background: '#E8530E',
                        animation: `redact-sweep ${REDACT_BAR_MS}ms ${redactDelay}ms linear forwards`,
                        width: 0,
                      }}
                    />
                  )}
                  {isActive && !isFailing && (
                    <span
                      className="absolute"
                      style={{
                        top: 0,
                        right: 1,
                        fontFamily: "'Inter', sans-serif",
                        fontSize: '9px',
                        fontWeight: 600,
                        color: '#E8530E',
                        lineHeight: 1,
                      }}
                    >
                      {pathIndex + 1}
                    </span>
                  )}
                </div>
              );
            })
          )}
          {/* SVG trail connecting selected cells */}
          {trailPoints.length >= 2 && (
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            >
              <polyline
                points={trailPoints.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#E8530E"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity="0.5"
              />
            </svg>
          )}
          {/* Found word rounded rectangles */}
          {foundWordPaths.map(({ word, cells }) => {
            const minR = Math.min(...cells.map(c => c.r));
            const maxR = Math.max(...cells.map(c => c.r));
            const minC = Math.min(...cells.map(c => c.c));
            const maxC = Math.max(...cells.map(c => c.c));
            const pad = 3; // px padding around the rectangle
            const cellW = 100 / COLS;
            const cellH = 100 / ROWS;
            return (
              <div
                key={word}
                style={{
                  position: 'absolute',
                  pointerEvents: 'none',
                  zIndex: 5,
                  left: `calc(${minC * cellW}% - ${pad}px)`,
                  top: `calc(${minR * cellH}% - ${pad}px)`,
                  width: `calc(${(maxC - minC + 1) * cellW}% + ${pad * 2}px)`,
                  height: `calc(${(maxR - minR + 1) * cellH}% + ${pad * 2}px)`,
                  border: '1.5px solid rgba(232, 83, 14, 0.2)',
                  borderRadius: 7,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Alphabet bar — QWERTY layout */}
      <div className="mt-8 flex flex-col items-center max-w-[420px] px-2" style={{ gap: 4 }}>
        {QWERTY_ROWS.map((row, rowIdx) => (
          <div key={rowIdx} className="flex justify-center" style={{ gap: 4 }}>
            {row.map(letter => {
              const isSelected = selectedLetters.includes(letter);
              return (
                <button
                  key={letter}
                  onClick={() => toggleLetter(letter)}
                  className="cursor-pointer spyxxing-key"
                  data-selected={isSelected || undefined}
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    width: 36,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isSelected ? '#E8530E' : '#F5F0E8',
                    color: isSelected ? '#FFFFFF' : '#1A1A1A',
                    opacity: isSelected ? 1 : 0.65,
                    border: '1px solid #1A1A1A',
                    borderRadius: 3,
                    boxShadow: isSelected ? 'none' : '2px 2px 0px #1A1A1A',
                    transform: isSelected ? 'translate(2px, 2px)' : 'none',
                    transition: 'all 0.1s ease',
                    padding: 0,
                  }}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Submit button */}
      <button
        onClick={fireReveal}
        disabled={!canSubmit}
        className="cursor-pointer"
        style={{
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600,
          fontSize: '0.85rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginTop: 20,
          padding: '10px 32px',
          background: canSubmit ? '#1A1A1A' : 'transparent',
          color: canSubmit ? '#FFFFFF' : '#1A1A1A',
          opacity: canSubmit ? 1 : 0.2,
          border: '2px solid #1A1A1A',
          borderRadius: 0,
          cursor: canSubmit ? 'pointer' : 'default',
          transition: 'all 0.15s ease',
        }}
      >
        REVEAL
      </button>

      {/* Reset */}
      <button
        onClick={initGame}
        className="cursor-pointer"
        style={{
          fontFamily: "'Inter', sans-serif",
          fontWeight: 500,
          fontSize: '0.75rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginTop: 16,
          padding: '6px 16px',
          background: 'transparent',
          color: '#1A1A1A',
          opacity: 0.35,
          border: 'none',
          cursor: 'pointer',
          transition: 'opacity 0.15s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.35')}
      >
        RESET
      </button>

      {/* Puzzle selector — game page */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 5,
          maxWidth: 380,
        }}
      >
        {PUZZLES.map((p, i) => (
          <button
            key={p.theme}
            onClick={() => { switchPuzzle(i); setTimeout(initGame, 0); }}
            className="cursor-pointer"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 600,
              fontSize: '0.65rem',
              letterSpacing: '0.04em',
              padding: '4px 8px',
              background: i === puzzleIndex ? '#E8530E' : 'transparent',
              color: i === puzzleIndex ? '#FFFFFF' : '#1A1A1A',
              opacity: i === puzzleIndex ? 1 : 0.35,
              border: i === puzzleIndex ? '1px solid #E8530E' : '1px solid #1A1A1A',
              borderRadius: 2,
              cursor: 'pointer',
              transition: 'all 0.1s ease',
            }}
          >
            {p.theme.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
