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

// ── Dark Cyberpunk Palette ───────────────────────────────────────────────────
const CYB = {
  bg: '#0a0a0f',
  wheelBg: '#12121e',
  wheelBorder: '#2a2a3a',
  wheelBorderFocused: '#4a4a6a',
  text: '#e0e0e8',
  textDim: '#6a6a7a',
  textMuted: '#484858',
  higher: '#f59e0b',    // amber
  lower: '#06b6d4',     // cyan
  correct: '#00e676',   // neon green
  correctDim: '#00c060',
  listen: '#c084fc',    // purple for listened position
  silent: '#3a3a4a',    // dim gray for silent/no-info
  // Glow shadows
  glowHigher: '0 0 8px rgba(245,158,11,0.5), 0 0 20px rgba(245,158,11,0.2)',
  glowLower: '0 0 8px rgba(6,182,212,0.5), 0 0 20px rgba(6,182,212,0.2)',
  glowCorrect: '0 0 8px rgba(0,230,118,0.5), 0 0 20px rgba(0,230,118,0.2)',
  // Text shadows for neon bleed
  textGlowHigher: '0 0 6px rgba(245,158,11,0.6), 0 0 14px rgba(245,158,11,0.25)',
  textGlowLower: '0 0 6px rgba(6,182,212,0.6), 0 0 14px rgba(6,182,212,0.25)',
  textGlowCorrect: '0 0 6px rgba(0,230,118,0.6), 0 0 14px rgba(0,230,118,0.25)',
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
}

function CustomKeyboard({ onLetterPress, onBackspace, onEnter, ranges, focusedWheel, onLeft, onRight }: CustomKeyboardProps) {
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

  const arrowBtnStyle: React.CSSProperties = {
    height: 32,
    width: 48,
    background: '#16162a',
    color: CYB.text,
    border: `1px solid ${CYB.wheelBorder}`,
    borderRadius: 6,
    fontSize: 18,
    fontWeight: 500,
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

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#0e0e18',
      borderTop: `1px solid ${CYB.wheelBorder}`,
      padding: '8px 4px',
      paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      gap: 5,
    }}>
      {/* Arrow row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
        <button
          onPointerDown={(e) => { e.preventDefault(); onLeft(); }}
          style={{ ...arrowBtnStyle, opacity: focusedWheel === 0 ? 0.35 : 1 }}
          aria-label="Move focus left"
        >←</button>
        <button
          onPointerDown={(e) => { e.preventDefault(); onRight(); }}
          style={{ ...arrowBtnStyle, opacity: focusedWheel === 4 ? 0.35 : 1 }}
          aria-label="Move focus right"
        >→</button>
      </div>
      {KB_ROWS.map((row, ri) => (
        <div key={ri} style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 4,
          // Row 2 (ASDFGHJKL) is shorter — add padding to center it
          ...(ri === 1 ? { paddingLeft: 16, paddingRight: 16 } : {}),
        }}>
          {row.map(key => {
            const isSpecial = key === 'ENTER' || key === '⌫';
            const dimmed = !isSpecial && !isLetterInRange(key);
            return (
              <button
                key={key}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleKey(key);
                }}
                style={{
                  flex: isSpecial ? 1.4 : 1,
                  height: 42,
                  background: isSpecial ? '#1a1a2e' : '#16162a',
                  color: key === 'ENTER' ? CYB.correct : CYB.text,
                  border: `1px solid ${isSpecial ? '#3a3a5a' : CYB.wheelBorder}`,
                  borderRadius: 6,
                  fontSize: isSpecial ? 11 : 16,
                  fontWeight: isSpecial ? 700 : 500,
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
                  textShadow: key === 'ENTER' ? CYB.textGlowCorrect : 'none',
                  opacity: dimmed ? 0.35 : 1,
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
    : isOffSolved ? 'rgba(0,230,118,0.35)'
    : kbFocused ? '#00e5ff'
    : focused ? CYB.wheelBorderFocused
    : CYB.wheelBorder;
  const staticBoxShadow = range.solved && !isOffSolved
    ? `inset 0 0 12px rgba(0,230,118,0.08), ${CYB.glowCorrect}`
    : kbFocused
      ? '0 0 8px rgba(0,229,255,0.5), 0 0 20px rgba(0,229,255,0.2)'
      : focused
        ? 'inset 0 1px 4px rgba(0,0,0,0.4)'
        : 'inset 0 1px 4px rgba(0,0,0,0.3)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        className={listening ? 'listen-pulse' : undefined}
        style={{
          position: 'relative',
          width: WHEEL_W,
          height: VIEWPORT_H,
          borderRadius: 12,
          border: `2px solid ${listening ? CYB.listen : staticBorderColor}`,
          overflow: 'hidden',
          background: CYB.wheelBg,
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
              else if (dist === 1) { fontSize = 17; fontWeight = 500; baseOpacity = 0.55; }
              else if (dist === 2) { fontSize = 12; fontWeight = 400; baseOpacity = 0.45; }
              else { fontSize = 10; fontWeight = 400; baseOpacity = 0.10; }

              const opacity = isSolvedLetter
                ? Math.max(baseOpacity, 0.7)
                : (!inRange ? Math.min(baseOpacity, 0.12) : baseOpacity);

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
                  color: isSolvedLetter ? '#fff' : CYB.text,
                  background: isSolvedLetter ? CYB.correctDim : 'transparent',
                  borderRadius: isSolvedLetter ? 4 : 0,
                  textShadow: isSolvedLetter ? CYB.textGlowCorrect : 'none',
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
          background: listening ? 'rgba(192,132,252,0.08)'
            : range.solved ? 'rgba(0,230,118,0.08)' : 'rgba(255,255,255,0.04)',
          borderRadius: 6,
          pointerEvents: 'none',
        }} />

        {/* Top/bottom fade */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: SLOT_H * 1.5,
          background: 'linear-gradient(to bottom, rgba(18,18,30,0.9), transparent)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: SLOT_H * 1.5,
          background: 'linear-gradient(to top, rgba(18,18,30,0.9), transparent)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Off-solved indicator */}
      {isOffSolved && (
        <div style={{
          marginTop: 2,
          fontSize: 9,
          fontWeight: 600,
          color: 'rgba(0,230,118,0.5)',
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
  const textGlow = feedback === 'correct' ? CYB.textGlowCorrect
    : feedback === 'higher' ? CYB.textGlowHigher
    : feedback === 'lower' ? CYB.textGlowLower
    : 'none';
  const icon = feedback === 'correct' ? '✓'
    : feedback === 'higher' ? '↑'
    : feedback === 'lower' ? '↓'
    : '\u2014';

  return (
    <div style={{
      width: WHEEL_W,
      height: TRAIL_ROW_H,
      background: '#141422',
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
        color: isSilent ? CYB.textMuted : '#d0d0d8',
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
          background: CYB.listen,
          boxShadow: '0 0 4px rgba(192,132,252,0.6)',
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
      {/* Target word */}
      <p style={{
        fontSize: 22,
        fontWeight: 700,
        fontFamily: 'var(--font-display)',
        color: CYB.text,
        margin: 0,
      }}>
        {target}
      </p>

      {/* Guess count */}
      <p style={{
        fontSize: 18,
        color: CYB.correct,
        textShadow: CYB.textGlowCorrect,
        fontWeight: 600,
        margin: 0,
      }}>
        Cracked in {guesses.length} {guesses.length === 1 ? 'guess' : 'guesses'}
      </p>

      {/* Share card preview */}
      <pre style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        lineHeight: 1.6,
        color: CYB.textDim,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${CYB.wheelBorder}`,
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
        style={{
          height: 44,
          padding: '0 24px',
          background: 'transparent',
          color: copied ? CYB.correct : CYB.text,
          border: `1.5px solid ${copied ? CYB.correct : CYB.text}`,
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 700,
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
          letterSpacing: '0.04em',
          boxShadow: copied
            ? CYB.glowCorrect
            : '0 0 12px rgba(224,224,232,0.15), 0 0 30px rgba(224,224,232,0.06)',
          transition: 'all 0.15s',
        }}
      >
        {copied ? 'Copied!' : 'Share'}
      </button>
    </div>
  );
}

// ── Logo ─────────────────────────────────────────────────────────────────────

function KeylockerLogo() {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-2">
        <div className="flex flex-col gap-2">
          <div className="w-14 h-14 bg-white rounded-lg" />
          <div className="w-14 h-14 bg-white rounded-lg relative">
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="w-4 h-4 bg-black rounded-full" />
              <div className="w-2 h-3 bg-black rounded-sm" />
            </div>
          </div>
          <div className="w-14 h-14 bg-white rounded-lg" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="w-14 h-14 bg-white rounded-lg" />
          <div className="w-14 h-14 bg-black border-4 border-white rounded-lg" />
          <div className="w-14 h-14 bg-white rounded-lg" />
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-5xl font-bold tracking-tight text-white" style={{ fontFamily: 'Space Mono, monospace' }}>
          KEYLOCKER
        </h1>
      </div>
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
        background: '#111120',
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
          <KeylockerLogo />

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
            onClick={() => { setPhase('playing'); if (isTouchDevice.current) setKeyboardOpen(true); }}
            style={{
              width: '100%',
              maxWidth: 280,
              height: 52,
              background: 'transparent',
              color: CYB.text,
              border: `1.5px solid ${CYB.text}`,
              borderRadius: 26,
              fontSize: 16,
              fontWeight: 700,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              boxShadow: '0 0 12px rgba(224,224,232,0.15), 0 0 30px rgba(224,224,232,0.06)',
              marginTop: 8,
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
          <h1
            onClick={() => setPhase('start')}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 28,
              margin: 0,
              letterSpacing: '-0.01em',
              color: CYB.text,
              cursor: 'pointer',
            }}
          >
            Keylocker
          </h1>
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
                  opacity: recency === 0 ? 1 : recency === 1 ? 0.4 : 0,
                  transition: 'bottom 0.4s ease-out, opacity 0.4s ease-out',
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
                      color: '#00e5ff',
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
                    marginTop: 3,
                    fontSize: 9,
                    fontWeight: 600,
                    fontFamily: 'var(--font-sans)',
                    color: r.solved ? CYB.correct : CYB.textMuted,
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
                style={{
                  height: 44,
                  padding: '0 24px',
                  background: 'transparent',
                  color: canSubmit ? CYB.text : CYB.textMuted,
                  border: canSubmit ? `1.5px solid ${CYB.text}` : `1.5px solid ${CYB.wheelBorder}`,
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: 'var(--font-sans)',
                  cursor: canSubmit ? 'pointer' : 'default',
                  whiteSpace: 'nowrap',
                  letterSpacing: canSubmit ? '0.06em' : '0',
                  boxShadow: canSubmit ? '0 0 12px rgba(224,224,232,0.15), 0 0 30px rgba(224,224,232,0.06)' : 'none',
                  transition: 'border-color 0.15s, color 0.15s, box-shadow 0.15s',
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
                background: keyboardOpen ? 'rgba(0,229,255,0.08)' : 'transparent',
                color: keyboardOpen ? '#00e5ff' : CYB.textDim,
                border: `1.5px solid ${keyboardOpen ? '#00e5ff' : CYB.wheelBorder}`,
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                letterSpacing: '0.04em',
                boxShadow: keyboardOpen ? '0 0 8px rgba(0,229,255,0.25)' : 'none',
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
        />
      )}

      {/* How to Play modal */}
      {showHtp && <HowToPlay onClose={closeHtp} />}
    </>
  );
}
