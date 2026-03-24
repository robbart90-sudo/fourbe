import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ANSWERS } from '../data/keylocker-answers';
import { WORDS } from '../data/keylocker-words';
import {
  getListenFeedback,
  computeRanges,
  getTodaysWord,
  generateShareCard,
  type Feedback,
  type GuessResult,
  type Range,
} from '../lib/keylocker';

// ── Constants ────────────────────────────────────────────────────────────────

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SLOT_H = 36;
const VISIBLE = 5;
const VIEWPORT_H = SLOT_H * VISIBLE;
const CENTER_Y = Math.floor(VISIBLE / 2) * SLOT_H;
const WHEEL_W = 48;
const WHEEL_GAP = 4;
const TRAIL_ROW_H = 44;
const TRAIL_GAP = 6;
const TRAIL_STEP = TRAIL_ROW_H + TRAIL_GAP;

const WORD_SET = new Set(WORDS);

// Custom keyboard height (content only, safe-area added in component)
const KB_HEIGHT = 193;

// Tap vs drag threshold (ms) — taps shorter than this select the listen target
const TAP_THRESHOLD = 150;

// QWERTY rows
const KB_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
];

// ── Neon Palette ─────────────────────────────────────────────────────────────
const CYB = {
  bg: '#08080F',
  wheelBg: '#0c0c18',
  wheelBorder: '#1a1a30',
  wheelBorderFocused: '#00F0FF44',
  text: 'rgba(255,255,255,0.7)',
  textBright: '#FFFFFF',
  textDim: 'rgba(0,240,255,0.5)',
  textMuted: 'rgba(255,255,255,0.25)',
  higher: '#FF00AA',    // magenta
  lower: '#00F0FF',     // cyan
  correct: '#00FF66',   // neon green
  correctDim: '#00cc52',
  listen: '#FF00AA',    // magenta for listened position
  silent: '#1a1a30',    // dim for silent/no-info
  neonCyan: '#00F0FF',
  neonMagenta: '#FF00AA',
  // Glow shadows
  glowHigher: '0 0 8px rgba(255,0,170,0.5), 0 0 20px rgba(255,0,170,0.2)',
  glowLower: '0 0 8px rgba(0,240,255,0.5), 0 0 20px rgba(0,240,255,0.2)',
  glowCorrect: '0 0 8px rgba(0,255,102,0.5), 0 0 20px rgba(0,255,102,0.2)',
  // Text shadows for neon bleed
  textGlowHigher: '0 0 6px rgba(255,0,170,0.6), 0 0 14px rgba(255,0,170,0.25)',
  textGlowLower: '0 0 6px rgba(0,240,255,0.6), 0 0 14px rgba(0,240,255,0.25)',
  textGlowCorrect: '0 0 6px rgba(0,255,102,0.6), 0 0 14px rgba(0,255,102,0.25)',
  glowTitle: '0 0 10px rgba(0,240,255,0.5), 0 0 20px rgba(0,240,255,0.3)',
};

// ── Seeded random starting positions ─────────────────────────────────────────

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

function wordSeed(word: string): number {
  return Array.from(word).reduce((acc, c) => Math.imul(acc, 31) + c.charCodeAt(0) | 0, 17) >>> 0;
}

function randomStartIndices(word: string): number[] {
  const rand = seededRand(wordSeed(word));
  return Array.from({ length: 5 }, () => Math.floor(rand() * 26));
}

const PLAYTEST_PUZZLES: string[] = [
  'CRANE', 'HOUSE', 'BRAVE', 'FROST', 'LIGHT',
  'DREAM', 'WORLD', 'PLANT', 'STONE', 'QUICK',
];

// ── Custom Keyboard ──────────────────────────────────────────────────────────

interface CustomKeyboardProps {
  onLetterPress: (letter: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
  ranges: Range[];
  focusedWheel: number;
  onLeft: () => void;
  onRight: () => void;
  enterActive?: boolean;
}

function CustomKeyboard({ onLetterPress, onBackspace, onEnter, ranges, focusedWheel, onLeft, onRight, enterActive }: CustomKeyboardProps) {
  const handleKey = (key: string) => {
    if (key === 'ENTER') onEnter();
    else if (key === '⌫') onBackspace();
    else onLetterPress(key);
  };

  const range = ranges[focusedWheel];
  const isLetterInRange = (letter: string) => {
    if (range.solved) return letter === range.letter;
    return letter >= range.lower && letter <= range.upper;
  };

  const neonKeyBase: React.CSSProperties = {
    background: '#0D0D15',
    borderRadius: 6,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  };

  const arrowBtnStyle: React.CSSProperties = {
    ...neonKeyBase,
    height: 32,
    width: 48,
    color: CYB.neonCyan,
    border: `1.5px solid ${CYB.neonCyan}`,
    boxShadow: '0 0 6px rgba(0,240,255,0.15)',
    fontSize: 18,
    fontWeight: 500,
    textShadow: '0 0 4px rgba(0,240,255,0.3)',
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'transparent',
      borderTop: '1px solid rgba(0,240,255,0.08)',
      padding: '8px 4px',
      paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      gap: 5,
      // dark scrim behind floating keys
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      backgroundImage: 'linear-gradient(to top, rgba(8,8,15,0.95), rgba(8,8,15,0.85))',
    }}>
      {/* Arrow row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
        <button
          onPointerDown={(e) => { e.preventDefault(); onLeft(); }}
          className="kl-kb-key"
          style={{ ...arrowBtnStyle, opacity: focusedWheel === 0 ? 0.25 : 1 }}
          aria-label="Move focus left"
        >←</button>
        <button
          onPointerDown={(e) => { e.preventDefault(); onRight(); }}
          className="kl-kb-key"
          style={{ ...arrowBtnStyle, opacity: focusedWheel === 4 ? 0.25 : 1 }}
          aria-label="Move focus right"
        >→</button>
      </div>
      {KB_ROWS.map((row, ri) => (
        <div key={ri} style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 4,
          ...(ri === 1 ? { paddingLeft: 16, paddingRight: 16 } : {}),
        }}>
          {row.map(key => {
            const isEnter = key === 'ENTER';
            const isBackspace = key === '⌫';
            const isSpecial = isEnter || isBackspace;
            const dimmed = !isSpecial && !isLetterInRange(key);

            // Per-key color logic
            let borderColor: string;
            let glowShadow: string;
            let textColor: string;
            let textShadowVal: string;

            if (isEnter) {
              if (enterActive) {
                borderColor = CYB.correct;
                glowShadow = `0 0 8px rgba(0,255,102,0.3), 0 0 16px rgba(0,255,102,0.1)`;
                textColor = CYB.correct;
                textShadowVal = `0 0 6px ${CYB.correct}`;
              } else {
                borderColor = 'rgba(0,255,102,0.15)';
                glowShadow = 'none';
                textColor = 'rgba(255,255,255,0.25)';
                textShadowVal = 'none';
              }
            } else if (isBackspace) {
              borderColor = 'rgba(255,0,170,0.4)';
              glowShadow = '0 0 4px rgba(255,0,170,0.1)';
              textColor = 'rgba(255,255,255,0.6)';
              textShadowVal = 'none';
            } else if (dimmed) {
              borderColor = 'rgba(0,240,255,0.08)';
              glowShadow = 'none';
              textColor = 'rgba(255,255,255,0.2)';
              textShadowVal = 'none';
            } else {
              borderColor = 'rgba(0,240,255,0.4)';
              glowShadow = '0 0 6px rgba(0,240,255,0.15)';
              textColor = 'rgba(255,255,255,0.7)';
              textShadowVal = '0 0 4px rgba(0,240,255,0.15)';
            }

            return (
              <button
                key={key}
                className="kl-kb-key"
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleKey(key);
                }}
                style={{
                  ...neonKeyBase,
                  flex: isSpecial ? 1.4 : 1,
                  height: 42,
                  color: textColor,
                  border: `1.5px solid ${borderColor}`,
                  fontSize: isSpecial ? 11 : 16,
                  fontWeight: isSpecial ? 700 : 500,
                  boxShadow: glowShadow,
                  textShadow: textShadowVal,
                  transition: 'all 0.08s ease',
                }}
              >
                {key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Lock Wheel ───────────────────────────────────────────────────────────────

interface LockWheelProps {
  selectedIndex: number;
  onIndexChange: (index: number) => void;
  focused: boolean;
  onFocus: () => void;
  range: Range;
  disabled: boolean;
  listening: boolean;
  onListenClick: () => void;
  solvedLetter?: string;
  currentLetter: string;
  kbFocused?: boolean;
  tappableWhileDisabled?: boolean;
}

// scrollTop ↔ selectedIndex: Z is visual position 0 (scrollTop=0), A is position 25 (scrollTop=25*SLOT_H)
const toScrollTop = (idx: number) => (25 - idx) * SLOT_H;
const fromScrollTop = (t: number) => Math.max(0, Math.min(25, 25 - Math.round(t / SLOT_H)));

// Max animation duration for keyboard-driven scrolls (ms)
const ANIM_DURATION = 420;

function LockWheel({ selectedIndex, onIndexChange, focused, onFocus, range, disabled, listening, onListenClick, solvedLetter, currentLetter, kbFocused, tappableWhileDisabled }: LockWheelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const isAnimating = useRef(false);
  const animRafRef = useRef(0);
  const dragRef = useRef({ active: false, startY: 0, startScrollTop: 0, moved: false });
  const touchRef = useRef({ startTime: 0, moved: false });
  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;
  const onListenClickRef = useRef(onListenClick);
  onListenClickRef.current = onListenClick;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const tappableRef = useRef(tappableWhileDisabled);
  tappableRef.current = tappableWhileDisabled;

  // Controlled animation: RAF-based scroll with fixed max duration
  const animateTo = useCallback((targetTop: number) => {
    const el = scrollRef.current;
    if (!el) return;
    cancelAnimationFrame(animRafRef.current);
    const startTop = el.scrollTop;
    const delta = targetTop - startTop;
    if (Math.abs(delta) < 1) {
      el.scrollTop = targetTop;
      isAnimating.current = false;
      return;
    }
    isAnimating.current = true;
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / ANIM_DURATION);
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      el.scrollTop = startTop + delta * ease;
      if (t < 1) {
        animRafRef.current = requestAnimationFrame(step);
      } else {
        el.scrollTop = targetTop;
        isAnimating.current = false;
      }
    };
    animRafRef.current = requestAnimationFrame(step);
  }, []);

  // Cleanup animation on unmount
  useEffect(() => () => cancelAnimationFrame(animRafRef.current), []);

  // Sync scroll position when selectedIndex changes externally (keyboard, reset)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = toScrollTop(selectedIndex);
    if (isFirstRender.current) {
      el.scrollTop = target;
      isFirstRender.current = false;
      return;
    }
    if (fromScrollTop(el.scrollTop) === selectedIndex) return;
    animateTo(target);
  }, [selectedIndex, animateTo]);

  const handleScroll = () => {
    if (isAnimating.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const idx = fromScrollTop(el.scrollTop);
    if (idx !== selectedIndex) onIndexChange(idx);
  };

  // Mouse drag
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isAnimating.current) return;
      if (!dragRef.current.active || !scrollRef.current) return;
      dragRef.current.moved = true;
      scrollRef.current.scrollTop =
        dragRef.current.startScrollTop + (dragRef.current.startY - e.clientY);
    };
    const onUp = () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      if (isAnimating.current) return;
      const el = scrollRef.current;
      if (!el) return;
      const idx = fromScrollTop(el.scrollTop);
      el.scrollTo({ top: toScrollTop(idx), behavior: 'smooth' });
      onIndexChangeRef.current(idx);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Touch handling with tap detection
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let startY = 0;
    let startScrollTop = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (isAnimating.current) return;
      startY = e.touches[0].clientY;
      startScrollTop = el.scrollTop;
      touchRef.current = { startTime: Date.now(), moved: false };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (disabledRef.current && !tappableRef.current) return;
      if (disabledRef.current && tappableRef.current) { e.preventDefault(); return; }
      if (isAnimating.current) { e.preventDefault(); return; }
      e.preventDefault();
      touchRef.current.moved = true;
      const delta = startY - e.touches[0].clientY;
      el.scrollTop = startScrollTop + delta;
      const idx = fromScrollTop(el.scrollTop);
      onIndexChangeRef.current(idx);
    };

    const onTouchEnd = () => {
      if (isAnimating.current) return;
      // Tap detection: short touch with no movement → select listen target
      const elapsed = Date.now() - touchRef.current.startTime;
      if (!touchRef.current.moved && elapsed < TAP_THRESHOLD) {
        if (!disabledRef.current || tappableRef.current) {
          onListenClickRef.current();
        }
        return;
      }
      if (disabledRef.current) return;
      const idx = fromScrollTop(el.scrollTop);
      el.scrollTo({ top: toScrollTop(idx), behavior: 'smooth' });
      onIndexChangeRef.current(idx);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled || isAnimating.current || !scrollRef.current) return;
    dragRef.current = { active: true, startY: e.clientY, startScrollTop: scrollRef.current.scrollTop, moved: false };
    onFocus();
    e.preventDefault();
  };

  // Click handler: if mouse didn't drag, this fires → select listen target
  const handleClick = () => {
    if (disabled && !tappableWhileDisabled) return;
    if (isAnimating.current) return;
    if (!dragRef.current.moved) {
      onListenClick();
    }
    onFocus();
  };

  const isOffSolved = solvedLetter != null && currentLetter !== solvedLetter;

  // Border and shadow — listening wheels use CSS animation class instead of static styles
  const staticBorderColor = range.solved && !isOffSolved ? CYB.correct
    : isOffSolved ? 'rgba(0,255,102,0.35)'
    : kbFocused ? CYB.neonCyan
    : focused ? CYB.neonCyan
    : 'rgba(0,240,255,0.3)';
  const staticBoxShadow = range.solved && !isOffSolved
    ? `0 0 10px rgba(0,255,102,0.3), inset 0 0 10px rgba(0,255,102,0.1), 4px 4px 0px rgba(0,255,102,0.15)`
    : kbFocused || focused
      ? `0 0 10px rgba(0,240,255,0.4), inset 0 0 10px rgba(0,240,255,0.1), 4px 4px 0px rgba(0,240,255,0.2)`
      : `0 0 10px rgba(0,240,255,0.15), inset 0 0 8px rgba(0,240,255,0.05), 4px 4px 0px rgba(0,240,255,0.1)`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        className={listening ? 'listen-pulse' : undefined}
        style={{
          position: 'relative',
          width: WHEEL_W,
          height: VIEWPORT_H,
          borderRadius: 12,
          border: `2px solid ${listening ? CYB.neonCyan : staticBorderColor}`,
          overflow: 'hidden',
          background: `linear-gradient(to bottom, #08080F 0%, #0D0D18 35%, #111120 50%, #0D0D18 65%, #08080F 100%)`,
          boxShadow: listening ? undefined : staticBoxShadow,
          transition: listening ? 'none' : 'border-color 0.15s, box-shadow 0.15s',
          cursor: disabled ? 'default' : 'grab',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchAction: 'none',
          ...(listening ? { animation: 'listen-pulse 1.8s ease-in-out infinite' } : {}),
        }}
      >
        {/* Scrollable letter strip */}
        <div
          ref={scrollRef}
          className="wheel-scroll"
          onScroll={handleScroll}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
          style={{
            width: '100%',
            height: '100%',
            overflowY: disabled ? 'hidden' : 'scroll',
            scrollSnapType: 'y mandatory',
            scrollPaddingTop: CENTER_Y,
            scrollbarWidth: 'none',
            overscrollBehavior: 'contain',
            touchAction: 'none',
          }}
        >
          <div style={{ paddingTop: CENTER_Y, paddingBottom: CENTER_Y }}>
            {LETTERS.split('').reverse().map((letter, visualPos) => {
              const i = 25 - visualPos;
              const dist = Math.abs(i - selectedIndex);
              const inRange = letter >= range.lower && letter <= range.upper;
              const isSolvedLetter = range.solved && letter === range.letter;

              let fontSize: number, fontWeight: number, baseOpacity: number;
              if (dist === 0) { fontSize = 24; fontWeight = 700; baseOpacity = 1; }
              else if (dist === 1) { fontSize = 17; fontWeight = 500; baseOpacity = 0.5; }
              else if (dist === 2) { fontSize = 12; fontWeight = 400; baseOpacity = 0.3; }
              else { fontSize = 10; fontWeight = 400; baseOpacity = 0.08; }

              const opacity = isSolvedLetter
                ? Math.max(baseOpacity, 0.8)
                : (!inRange ? Math.min(baseOpacity, 0.15) : (dist === 0 ? 1 : baseOpacity * 1.2));

              return (
                <div key={i} style={{
                  height: SLOT_H,
                  scrollSnapAlign: 'start',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize,
                  fontWeight,
                  fontFamily: 'var(--font-sans)',
                  opacity,
                  color: isSolvedLetter ? '#fff' : (dist === 0 ? '#FFFFFF' : 'rgba(255,255,255,0.85)'),
                  background: isSolvedLetter ? CYB.correctDim : 'transparent',
                  borderRadius: isSolvedLetter ? 4 : 0,
                  textShadow: isSolvedLetter ? CYB.textGlowCorrect : (dist === 0 ? '0 0 6px rgba(255,255,255,0.15)' : 'none'),
                  transition: 'font-size 0.12s, opacity 0.12s',
                  lineHeight: 1,
                }}>
                  {letter}
                </div>
              );
            })}
          </div>
        </div>

        {/* Center selection highlight */}
        <div style={{
          position: 'absolute',
          top: CENTER_Y,
          left: 2,
          right: 2,
          height: SLOT_H,
          background: listening ? 'rgba(0,240,255,0.06)'
            : range.solved ? 'rgba(0,255,102,0.06)' : 'rgba(255,255,255,0.03)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 4,
          pointerEvents: 'none',
        }} />

        {/* Top/bottom fade — matches cylinder gradient ends */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: SLOT_H * 1.5,
          background: 'linear-gradient(to bottom, #08080F 20%, transparent)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: SLOT_H * 1.5,
          background: 'linear-gradient(to top, #08080F 20%, transparent)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Off-solved indicator */}
      {isOffSolved && (
        <div style={{
          marginTop: 2,
          fontSize: 9,
          fontWeight: 600,
          color: 'rgba(0,255,102,0.5)',
          textShadow: '0 0 4px rgba(0,255,102,0.3)',
          fontFamily: 'var(--font-sans)',
          lineHeight: 1,
        }}>
          {solvedLetter} ✓
        </div>
      )}
    </div>
  );
}

// ── Trail Cell ───────────────────────────────────────────────────────────────

function TrailCell({ letter, feedback, isListened }: { letter: string; feedback: Feedback; isListened: boolean }) {
  const isSilent = feedback === 'silent';
  const color = feedback === 'correct' ? CYB.correct
    : feedback === 'higher' ? CYB.higher
    : feedback === 'lower' ? CYB.lower
    : CYB.silent;
  const glow = feedback === 'correct' ? CYB.glowCorrect
    : feedback === 'higher' ? CYB.glowHigher
    : feedback === 'lower' ? CYB.glowLower
    : 'none';
  const textGlow = feedback === 'correct' ? `0 0 8px ${CYB.correct}, 0 0 16px ${CYB.correct}`
    : feedback === 'higher' ? `0 0 8px ${CYB.higher}, 0 0 16px ${CYB.higher}`
    : feedback === 'lower' ? `0 0 8px ${CYB.lower}, 0 0 16px ${CYB.lower}`
    : 'none';
  const icon = feedback === 'correct' ? '✓'
    : feedback === 'higher' ? '↑'
    : feedback === 'lower' ? '↓'
    : '\u2014';

  return (
    <div style={{
      width: WHEEL_W,
      height: TRAIL_ROW_H,
      background: '#0c0c18',
      border: `1px solid ${isSilent ? CYB.silent : color}`,
      borderRadius: 6,
      boxShadow: glow,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
      fontFamily: 'var(--font-sans)',
      position: 'relative',
      opacity: isSilent ? 0.5 : 1,
    }}>
      <span style={{
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 1,
        color: isSilent ? CYB.textMuted : CYB.text,
      }}>{letter}</span>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1,
        color: isSilent ? CYB.textMuted : color,
        textShadow: textGlow,
      }}>{icon}</span>
      {isListened && (
        <div style={{
          position: 'absolute',
          bottom: 2,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: CYB.neonCyan,
          boxShadow: `0 0 6px ${CYB.neonCyan}`,
        }} />
      )}
    </div>
  );
}

// ── End Screen ───────────────────────────────────────────────────────────────

function EndScreen({ guesses, target, today }: { guesses: GuessResult[]; target: string; today: string }) {
  const [copied, setCopied] = useState(false);
  const shareText = generateShareCard(guesses, today);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
        return;
      } catch { /* user cancelled or share not supported */ }
    }
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      textAlign: 'center',
      marginTop: 24,
      animation: 'fade-in 0.4s ease-out',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
    }}>
      <KeylockerLogo variant="combined" size="md" />

      {/* Target word */}
      <p style={{
        fontSize: 22,
        fontWeight: 700,
        fontFamily: 'var(--font-display)',
        color: CYB.textBright,
        margin: 0,
        textShadow: '0 0 8px rgba(255,255,255,0.15)',
      }}>
        {target}
      </p>

      {/* Guess count */}
      <p style={{
        fontSize: 14,
        color: CYB.text,
        fontWeight: 500,
        margin: 0,
      }}>
        Cracked in{' '}
        <span style={{
          fontSize: 32,
          fontWeight: 700,
          color: CYB.correct,
          textShadow: `0 0 10px ${CYB.correct}, 0 0 20px ${CYB.correct}, 0 0 40px rgba(0,255,102,0.3)`,
          verticalAlign: 'middle',
        }}>
          {guesses.length}
        </span>
        {' '}{guesses.length === 1 ? 'guess' : 'guesses'}
      </p>

      {/* Share card preview */}
      <pre style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        lineHeight: 1.6,
        color: CYB.text,
        background: 'rgba(0,240,255,0.02)',
        border: `1px solid rgba(0,240,255,0.15)`,
        borderRadius: 8,
        padding: '12px 16px',
        margin: 0,
        whiteSpace: 'pre',
        textAlign: 'left',
      }}>
        {shareText}
      </pre>

      {/* Copy/Share button */}
      <button
        onClick={handleShare}
        className="kl-submit-btn"
        style={{
          height: 44,
          padding: '0 24px',
          background: copied ? 'rgba(0,255,102,0.04)' : 'rgba(0,240,255,0.04)',
          color: copied ? CYB.correct : CYB.textBright,
          border: `2px solid ${copied ? CYB.correct : CYB.neonCyan}`,
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 700,
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
          letterSpacing: '0.04em',
          boxShadow: copied
            ? `0 0 10px rgba(0,255,102,0.3), 0 0 20px rgba(0,255,102,0.1)`
            : `0 0 10px rgba(0,240,255,0.3), 0 0 20px rgba(0,240,255,0.1)`,
          textShadow: copied ? `0 0 6px ${CYB.correct}` : '0 0 6px rgba(0,240,255,0.3)',
          transition: 'all 0.15s',
        }}
      >
        {copied ? 'Copied!' : 'Share'}
      </button>
    </div>
  );
}

// ── Logo ─────────────────────────────────────────────────────────────────────

interface KeylockerLogoProps {
  variant?: 'combined' | 'wordmark' | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const LOGO_SIZES = {
  sm: { cell: 24, gap: 2, font: 20, iconGap: 4, wordmarkGap: 0 },
  md: { cell: 40, gap: 3, font: 36, iconGap: 8, wordmarkGap: 4 },
  lg: { cell: 56, gap: 4, font: 48, iconGap: 12, wordmarkGap: 6 },
  xl: { cell: 72, gap: 5, font: 64, iconGap: 16, wordmarkGap: 8 },
};

function KeylockerIcon({ cellSize, gapSize }: { cellSize: number; gapSize: number }) {
  const r = Math.max(2, cellSize * 0.1);
  const khR = cellSize * 0.14;
  const khW = cellSize * 0.1;
  const khH = cellSize * 0.12;
  return (
    <div style={{ display: 'flex', gap: gapSize }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: gapSize }}>
        <div style={{ width: cellSize, height: cellSize, borderRadius: r, background: '#0c0c18', border: '1px solid #1a1a30', boxShadow: '0 0 8px rgba(0,240,255,0.1)' }} />
        <div style={{ width: cellSize, height: cellSize, borderRadius: r, background: '#0c0c18', border: '1px solid #00F0FF44', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: khR * 2, height: khR * 2, borderRadius: '50%', background: CYB.neonCyan, boxShadow: CYB.glowLower }} />
          <div style={{ width: khW * 2, height: khH * 2, borderRadius: khW * 0.4, background: CYB.neonCyan, marginTop: -1 }} />
        </div>
        <div style={{ width: cellSize, height: cellSize, borderRadius: r, background: '#0c0c18', border: '1px solid #1a1a30', boxShadow: '0 0 8px rgba(0,240,255,0.1)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: gapSize }}>
        <div style={{ width: cellSize, height: cellSize, borderRadius: r, background: '#0c0c18', border: '1px solid #1a1a30', boxShadow: '0 0 8px rgba(0,240,255,0.1)' }} />
        <div style={{ width: cellSize, height: cellSize, borderRadius: r, background: '#08080F', border: '2px solid #00F0FF66', boxShadow: CYB.glowLower }} />
        <div style={{ width: cellSize, height: cellSize, borderRadius: r, background: '#0c0c18', border: '1px solid #1a1a30', boxShadow: '0 0 8px rgba(0,240,255,0.1)' }} />
      </div>
    </div>
  );
}

function KeylockerWordmark({ fontSize }: { fontSize: number }) {
  return (
    <span style={{
      fontFamily: 'Space Mono, monospace',
      fontWeight: 700,
      fontSize,
      letterSpacing: '-0.02em',
      color: CYB.textBright,
      textShadow: CYB.glowTitle,
      lineHeight: 1,
    }}>
      KEYLOCKER
    </span>
  );
}

function KeylockerLogo({ variant = 'combined', size = 'lg' }: KeylockerLogoProps) {
  const s = LOGO_SIZES[size];

  if (variant === 'icon') {
    return <KeylockerIcon cellSize={s.cell} gapSize={s.gap} />;
  }

  if (variant === 'wordmark') {
    return <KeylockerWordmark fontSize={s.font} />;
  }

  // combined
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s.iconGap }}>
      <KeylockerIcon cellSize={s.cell} gapSize={s.gap} />
      <KeylockerWordmark fontSize={s.font} />
    </div>
  );
}

// ── How to Play Modal ─────────────────────────────────────────────────────────

const HTP_SEEN_KEY = 'keylocker-played-before';

function HowToPlay({ onClose }: { onClose: () => void }) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  const hi = { color: CYB.higher, textShadow: CYB.textGlowHigher, fontWeight: 700 } as const;
  const lo = { color: CYB.lower, textShadow: CYB.textGlowLower, fontWeight: 700 } as const;
  const ok = { color: CYB.correct, textShadow: CYB.textGlowCorrect, fontWeight: 700 } as const;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        padding: 16,
      }}
    >
      <div style={{
        background: '#0a0a16',
        border: `1px solid ${CYB.wheelBorder}`,
        borderRadius: 14,
        maxWidth: 380,
        width: '100%',
        maxHeight: '85dvh',
        overflowY: 'auto',
        padding: '24px 22px',
        position: 'relative',
        boxShadow: '0 0 40px rgba(0,0,0,0.6)',
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 14,
            background: 'none',
            border: 'none',
            color: CYB.textDim,
            fontSize: 20,
            cursor: 'pointer',
            lineHeight: 1,
            padding: 4,
          }}
          aria-label="Close"
        >×</button>

        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 20,
          color: CYB.text,
          margin: '0 0 16px',
        }}>How to Play Keylocker</h2>

        <div style={{
          fontSize: 13,
          lineHeight: 1.65,
          color: CYB.text,
          fontFamily: 'var(--font-sans)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <p style={{ margin: 0 }}>
            Crack the 5-letter combination.
          </p>
          <p style={{ margin: 0 }}>
            Type in each slot to spell a real word, then lock it in. Select one position to check.
          </p>
          <div style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ margin: 0 }}>
              <span style={hi}>↑</span>{' '}The correct letter is <strong style={{ color: CYB.text }}>higher</strong> in the alphabet
            </p>
            <p style={{ margin: 0 }}>
              <span style={lo}>↓</span>{' '}The correct letter is <strong style={{ color: CYB.text }}>lower</strong> in the alphabet
            </p>
            <p style={{ margin: 0 }}>
              <span style={ok}>✓</span>{' '}<strong style={{ color: CYB.text }}>Exact match</strong>
            </p>
          </div>
          <p style={{ margin: 0 }}>
            You only get feedback on the position you selected — but exact matches always reveal themselves.
          </p>
          {isTouchDevice && (
            <div style={{ marginTop: 4 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 12, color: CYB.text, letterSpacing: '0.04em' }}>
                CONTROLS
              </p>
              <p style={{ margin: 0 }}>
                Use the keyboard to type letters into each wheel. Use ← → to move between positions.
              </p>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 20,
            width: '100%',
            height: 42,
            background: 'transparent',
            color: CYB.text,
            border: `1.5px solid ${CYB.text}`,
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            letterSpacing: '0.04em',
            boxShadow: '0 0 12px rgba(224,224,232,0.1)',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Keylocker() {
  const [phase, setPhase] = useState<'start' | 'playing'>('start');
  const [playtestIndex, setPlaytestIndex] = useState<number | null>(null);
  const [guesses, setGuesses] = useState<GuessResult[]>([]);
  const [wheelIndices, setWheelIndices] = useState(() => randomStartIndices(getTodaysWord(ANSWERS)));
  const [focusedWheel, setFocusedWheel] = useState(0);
  const [lockedIn, setLockedIn] = useState(false);
  const [checkedWheel, setCheckedWheel] = useState<number | null>(null);
  const [won, setWon] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [showHtp, setShowHtp] = useState(() => !localStorage.getItem(HTP_SEEN_KEY));
  const isTouchDevice = useRef(typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0));

  // Favicon + title + OG swap
  useEffect(() => {
    const link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    const prev = link?.href;
    if (link) link.href = '/keylocker-favicon.svg';
    document.title = 'Keylocker';

    const ogTags: Record<string, string> = {
      'og:title': 'Keylocker',
      'og:description': 'Crack the combination. One key at a time.',
      'og:image': '/og-keylocker.png',
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

  const target = useMemo(() => {
    if (playtestIndex !== null) return PLAYTEST_PUZZLES[playtestIndex];
    return getTodaysWord(ANSWERS);
  }, [playtestIndex]);

  const ranges = computeRanges(guesses);
  const currentWord = wheelIndices.map(i => LETTERS[i]).join('');
  const isValidWord = WORD_SET.has(currentWord);
  const canSubmit = lockedIn ? checkedWheel !== null : isValidWord;

  const focusedRef = useRef(focusedWheel);
  focusedRef.current = focusedWheel;
  const lockedInRef = useRef(lockedIn);
  lockedInRef.current = lockedIn;
  const wonRef = useRef(won);
  wonRef.current = won;

  const submitRef = useRef(() => {});
  submitRef.current = () => {
    if (won) return;
    const word = wheelIndices.map(i => LETTERS[i]).join('');
    if (!lockedIn) {
      // Phase 1: lock in the word
      if (!WORD_SET.has(word)) return;
      setLockedIn(true);
      setCheckedWheel(null);
    } else {
      // Phase 2: check the selected position
      if (checkedWheel === null) return;
      const fb = getListenFeedback(word, target, checkedWheel);
      setGuesses(prev => [...prev, { word, feedback: fb, listenedPos: checkedWheel }]);
      setLockedIn(false);
      setCheckedWheel(null);
      setFocusedWheel(0);
      if (fb.every(f => f === 'correct')) { setWon(true); setKeyboardOpen(false); }
    }
  };

  const handlePuzzleChange = useCallback((value: string) => {
    // Blur the select so it doesn't swallow keyboard events
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const newIndex = value === 'daily' ? null : Number(value);
    const newTarget = newIndex !== null ? PLAYTEST_PUZZLES[newIndex] : getTodaysWord(ANSWERS);
    setPlaytestIndex(newIndex);
    setGuesses([]);
    setWheelIndices(randomStartIndices(newTarget));
    setFocusedWheel(0);
    setLockedIn(false);
    setCheckedWheel(null);
    setWon(false);
    setResetKey(k => k + 1);
    if (isTouchDevice.current) setKeyboardOpen(true);
  }, []);

  // Physical keyboard handler (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (wonRef.current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.tagName === 'SELECT') return;

      if (lockedInRef.current) {
        // Phase 2: only 1-5 and Enter
        if (/^[1-5]$/.test(e.key)) {
          e.preventDefault();
          setCheckedWheel(Number(e.key) - 1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          submitRef.current();
        } else {
          e.preventDefault();
        }
        return;
      }

      // Phase 1: word building
      const fw = focusedRef.current;

      if (e.key === 'Enter') {
        e.preventDefault();
        submitRef.current();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setWheelIndices(prev => {
          const next = [...prev];
          next[fw] = Math.min(25, next[fw] + 1);
          return next;
        });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setWheelIndices(prev => {
          const next = [...prev];
          next[fw] = Math.max(0, next[fw] - 1);
          return next;
        });
      } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setFocusedWheel(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setFocusedWheel(prev => Math.min(4, prev + 1));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setFocusedWheel(prev => Math.max(0, prev - 1));
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        const letterIndex = e.key.toUpperCase().charCodeAt(0) - 65;
        setWheelIndices(prev => {
          const next = [...prev];
          next[fw] = letterIndex;
          return next;
        });
        setFocusedWheel(prev => Math.min(4, prev + 1));
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Custom keyboard handlers
  const handleLetterPress = useCallback((letter: string) => {
    if (wonRef.current || lockedInRef.current) return;
    const letterIndex = letter.charCodeAt(0) - 65;
    const fw = focusedRef.current;
    setWheelIndices(prev => {
      const next = [...prev];
      next[fw] = letterIndex;
      return next;
    });
    setFocusedWheel(prev => Math.min(4, prev + 1));
  }, []);

  const handleBackspace = useCallback(() => {
    if (wonRef.current || lockedInRef.current) return;
    setFocusedWheel(prev => Math.max(0, prev - 1));
  }, []);

  const handleKbEnter = useCallback(() => {
    submitRef.current();
  }, []);

  const closeHtp = useCallback(() => {
    setShowHtp(false);
    localStorage.setItem(HTP_SEEN_KEY, '1');
  }, []);

  const toggleKeyboard = () => {
    if (keyboardOpen) {
      setKeyboardOpen(false);
    } else {
      setKeyboardOpen(true);
      setFocusedWheel(0);
    }
  };

  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const lockWidth = 5 * WHEEL_W + 4 * WHEEL_GAP;

  // Submit button label
  const submitLabel = !lockedIn
    ? (!isValidWord ? 'Not a word' : `Lock In ${currentWord}`)
    : 'Check';

  // ── Start Screen ──
  if (phase === 'start') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: '24px 16px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <KeylockerLogo variant="combined" size="lg" />

          <p style={{
            fontSize: 14,
            color: CYB.textDim,
            fontFamily: 'var(--font-sans)',
            margin: 0,
          }}>
            Crack the combo. One key at a time.
          </p>

          <p style={{
            fontSize: 13,
            color: CYB.textMuted,
            fontFamily: 'var(--font-sans)',
            margin: 0,
          }}>
            {today}
          </p>

          <button
            className="kl-play-btn"
            onClick={() => { setPhase('playing'); if (isTouchDevice.current) setKeyboardOpen(true); }}
            style={{
              width: '100%',
              maxWidth: 280,
              height: 52,
              background: 'rgba(0,240,255,0.04)',
              color: CYB.neonCyan,
              border: `2px solid ${CYB.neonCyan}`,
              borderRadius: 26,
              fontSize: 16,
              fontWeight: 700,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              boxShadow: `0 0 10px rgba(0,240,255,0.3), 0 0 20px rgba(0,240,255,0.1)`,
              textShadow: CYB.textGlowLower,
              marginTop: 8,
              transition: 'all 0.15s ease',
            }}
          >
            Play
          </button>

          <select
            value={playtestIndex !== null ? String(playtestIndex) : 'daily'}
            onChange={e => handlePuzzleChange(e.target.value)}
            style={{
              marginTop: 4,
              fontSize: 12,
              color: CYB.textDim,
              background: 'transparent',
              border: '1px solid rgba(0,240,255,0.15)',
              borderRadius: 6,
              padding: '4px 8px',
              outline: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              opacity: 0.6,
              transition: 'opacity 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { const el = e.target as HTMLSelectElement; el.style.opacity = '1'; el.style.borderColor = 'rgba(0,240,255,0.4)'; }}
            onMouseLeave={e => { const el = e.target as HTMLSelectElement; el.style.opacity = '0.6'; el.style.borderColor = 'rgba(0,240,255,0.15)'; }}
          >
            <option value="daily">Daily Puzzle</option>
            {PLAYTEST_PUZZLES.map((_, i) => (
              <option key={i} value={String(i)}>
                Playtest Puzzle #{i + 1}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowHtp(true)}
            style={{
              background: 'none',
              border: 'none',
              color: CYB.textDim,
              fontSize: 12,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              marginTop: 2,
            }}
          >
            How to Play
          </button>
        </div>

        {showHtp && <HowToPlay onClose={closeHtp} />}
      </div>
    );
  }

  // ── Playing Screen ──
  return (
    <>
      <div style={{
        maxWidth: 440,
        margin: '0 auto',
        padding: '20px 12px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        ...(won
          ? { minHeight: '100dvh', overflow: 'auto' as const }
          : { height: '100dvh', overflow: 'hidden' as const, paddingBottom: keyboardOpen ? KB_HEIGHT + 16 : 16, transition: 'padding-bottom 0.2s ease-out' }
        ),
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 4, flexShrink: 0, position: 'relative', width: '100%' }}>
          <div onClick={() => setPhase('start')} style={{ cursor: 'pointer' }}>
            <KeylockerLogo variant="wordmark" size="sm" />
          </div>
          <button
            onClick={() => setShowHtp(true)}
            style={{
              position: 'absolute',
              top: 2,
              right: 4,
              background: 'none',
              border: `1px solid ${CYB.wheelBorder}`,
              borderRadius: '50%',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: CYB.textDim,
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              lineHeight: 1,
            }}
            aria-label="How to play"
          >?</button>
          <p style={{
            margin: '2px 0 0',
            fontSize: 12,
            color: CYB.textDim,
            fontFamily: 'var(--font-sans)',
          }}>
            {today}
          </p>
          <select
            value={playtestIndex !== null ? String(playtestIndex) : 'daily'}
            onChange={e => handlePuzzleChange(e.target.value)}
            style={{
              marginTop: 4,
              fontSize: 11,
              color: CYB.textDim,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              opacity: 0.6,
            }}
            onMouseEnter={e => { (e.target as HTMLSelectElement).style.opacity = '1'; }}
            onMouseLeave={e => { (e.target as HTMLSelectElement).style.opacity = '0.6'; }}
          >
            <option value="daily">Daily Puzzle</option>
            {PLAYTEST_PUZZLES.map((_, i) => (
              <option key={i} value={String(i)}>
                Playtest Puzzle #{i + 1}
              </option>
            ))}
          </select>
        </div>

        {/* Game area */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          marginTop: 12,
        }}>
          {/* Guess trail */}
          <div style={{
            width: lockWidth,
            height: TRAIL_STEP * 2,
            position: 'relative',
            overflow: 'hidden',
            marginBottom: 10,
            flexShrink: 0,
          }}>
            {guesses.map((guess, i) => {
              const recency = guesses.length - 1 - i;
              if (recency > 2) return null;
              return (
                <div key={i} style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: recency * TRAIL_STEP,
                  display: 'flex',
                  gap: WHEEL_GAP,
                  justifyContent: 'center',
                  opacity: recency === 0 ? 1 : recency === 1 ? 0.35 : 0,
                  transition: 'bottom 0.4s ease-out, opacity 0.4s ease-out',
                  paddingBottom: recency > 0 ? TRAIL_GAP : 0,
                  borderBottom: recency > 0 ? '1px solid rgba(0,240,255,0.12)' : 'none',
                }}>
                  {Array.from(guess.word).map((letter, li) => (
                    <TrailCell
                      key={li}
                      letter={letter}
                      feedback={guess.feedback[li]}
                      isListened={li === guess.listenedPos}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          {/* Bike lock + range labels */}
          <div key={resetKey} style={{
            display: 'flex',
            gap: WHEEL_GAP,
            flexShrink: 0,
          }}>
            {[0, 1, 2, 3, 4].map(pos => {
              const r = ranges[pos];
              const currentLetter = LETTERS[wheelIndices[pos]];
              return (
                <div key={pos} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                  {keyboardOpen && focusedWheel === pos && (
                    <div style={{
                      position: 'absolute',
                      top: -14,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      color: '#00F0FF',
                      fontSize: 10,
                      lineHeight: 1,
                      animation: 'kb-cursor-blink 1s ease-in-out infinite',
                      pointerEvents: 'none',
                    }}>▼</div>
                  )}
                  <LockWheel
                    selectedIndex={wheelIndices[pos]}
                    onIndexChange={idx => setWheelIndices(prev => {
                      const next = [...prev];
                      next[pos] = idx;
                      return next;
                    })}
                    focused={focusedWheel === pos}
                    onFocus={() => setFocusedWheel(pos)}
                    range={r}
                    disabled={won || lockedIn}
                    listening={checkedWheel === pos}
                    onListenClick={() => { if (lockedIn) setCheckedWheel(pos); }}
                    tappableWhileDisabled={lockedIn}
                    solvedLetter={r.solved ? r.letter : undefined}
                    currentLetter={currentLetter}
                    kbFocused={keyboardOpen && focusedWheel === pos}
                  />
                  <div style={{
                    marginTop: 4,
                    fontSize: 9,
                    fontWeight: 600,
                    fontFamily: 'var(--font-sans)',
                    color: r.solved ? CYB.correct : CYB.textDim,
                    textShadow: r.solved ? CYB.textGlowCorrect : 'none',
                    whiteSpace: 'nowrap',
                    lineHeight: 1,
                  }}>
                    {r.solved
                      ? <>{r.letter} <span style={{ fontSize: 8 }}>✓</span></>
                      : `${r.lower}\u2013${r.upper}`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Phase 2 prompt */}
          {lockedIn && !won && (
            <p style={{
              marginTop: 14,
              marginBottom: 0,
              fontSize: 12,
              color: CYB.textDim,
              fontFamily: 'var(--font-sans)',
              textAlign: 'center',
            }}>
              Tap a position to check
            </p>
          )}

          {/* Submit button + Back */}
          {!won && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: lockedIn ? 6 : 16, flexShrink: 0 }}>
              {lockedIn && (
                <button
                  onClick={() => { setLockedIn(false); setCheckedWheel(null); }}
                  style={{
                    height: 36,
                    padding: '0 10px',
                    background: 'transparent',
                    color: CYB.textDim,
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                    fontFamily: 'var(--font-sans)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ← Back
                </button>
              )}
              <button
                onClick={() => submitRef.current()}
                disabled={!canSubmit}
                className="kl-submit-btn"
                style={{
                  height: 44,
                  padding: '0 24px',
                  background: canSubmit ? 'rgba(0,240,255,0.04)' : 'transparent',
                  color: canSubmit ? CYB.textBright : CYB.textMuted,
                  border: canSubmit ? `2px solid ${CYB.neonCyan}` : `2px solid rgba(0,240,255,0.2)`,
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: 'var(--font-sans)',
                  cursor: canSubmit ? 'pointer' : 'default',
                  whiteSpace: 'nowrap',
                  letterSpacing: canSubmit ? '0.06em' : '0',
                  boxShadow: canSubmit
                    ? '0 0 10px rgba(0,240,255,0.3), 0 0 20px rgba(0,240,255,0.1)'
                    : 'none',
                  textShadow: canSubmit ? '0 0 6px rgba(0,240,255,0.3)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {submitLabel}
              </button>
            </div>
          )}

          {/* Keyboard toggle button — touch devices only */}
          {!won && !lockedIn && isTouchDevice.current && (
            <button
              className="kb-toggle-btn"
              onClick={toggleKeyboard}
              style={{
                marginTop: 10,
                height: 34,
                padding: '0 14px',
                background: keyboardOpen ? 'rgba(0,240,255,0.06)' : 'transparent',
                color: keyboardOpen ? CYB.neonCyan : CYB.textDim,
                border: `1.5px solid ${keyboardOpen ? CYB.neonCyan : 'rgba(0,240,255,0.2)'}`,
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                letterSpacing: '0.04em',
                boxShadow: keyboardOpen ? '0 0 8px rgba(0,240,255,0.25)' : 'none',
                transition: 'all 0.15s',
                alignItems: 'center',
                gap: 6,
                flexShrink: 0,
              }}
              aria-label={keyboardOpen ? 'Dismiss keyboard' : 'Open keyboard'}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>⌨</span>
              <span>{keyboardOpen ? 'Done' : 'Type'}</span>
            </button>
          )}

          {/* End screen */}
          {won && (
            <EndScreen guesses={guesses} target={target} today={today} />
          )}
        </div>
      </div>

      {/* Custom on-screen keyboard */}
      {isTouchDevice.current && keyboardOpen && !won && (
        <CustomKeyboard
          onLetterPress={handleLetterPress}
          onBackspace={handleBackspace}
          onEnter={handleKbEnter}
          ranges={ranges}
          focusedWheel={focusedWheel}
          onLeft={() => setFocusedWheel(prev => Math.max(0, prev - 1))}
          onRight={() => setFocusedWheel(prev => Math.min(4, prev + 1))}
          enterActive={canSubmit}
        />
      )}

      {/* How to Play modal */}
      {showHtp && <HowToPlay onClose={closeHtp} />}
    </>
  );
}
