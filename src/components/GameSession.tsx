import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Puzzle, Round, RoundResult } from '../types';
import GameRound from './GameRound';
import type { GameRoundHandle } from './GameRound';
import { FourbeLogo } from './FourbeLogo';
import HowToPlayModal from './HowToPlayModal';
import { playPerfectJingle, playFailSound } from '../lib/sounds';
import { trackGameResult } from '../lib/analytics';

const HTP_SEEN_KEY = 'fourbe-played-before';
const TILE_MAX_SM = 36;
const TILE_MIN_SM = 18;
const TILE_GAP_SM = 3;
const ROOT_MAX_WIDTH = 600;
const ROOT_PADDING = 32;
const MAX_LIVES = 4;

type SessionPhase = 'start' | 'playing' | 'final-round' | 'reveal';

function isLetter(ch: string): boolean {
  return ch >= 'A' && ch <= 'Z';
}

function getAvailableWidth() {
  if (typeof window === 'undefined') return 400;
  return Math.min(window.innerWidth, ROOT_MAX_WIDTH) - ROOT_PADDING;
}

function useAvailableWidth() {
  const [width, setWidth] = useState(getAvailableWidth);
  useEffect(() => {
    const onResize = () => setWidth(getAvailableWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

// --- Shared tile row for displaying answers ---
function AnswerTileRow({ answer, variant, availableWidth, highlightCharIndices }: {
  answer: string;
  variant: 'solved' | 'failed';
  availableWidth: number;
  highlightCharIndices?: number[];
}) {
  const upper = answer.toUpperCase();
  const defaultTileClass = variant === 'solved'
    ? 'border-player bg-player text-white'
    : 'border-[#c9bfb0] bg-[#efe9e0] text-[#9a8e80]';

  const tileSize = useMemo(() => {
    const words = upper.split(' ');
    const longestWord = Math.max(...words.map((w) => [...w].filter(isLetter).length));
    const maxFit = Math.floor((availableWidth - (longestWord - 1) * TILE_GAP_SM) / longestWord);
    return Math.max(TILE_MIN_SM, Math.min(TILE_MAX_SM, maxFit));
  }, [upper, availableWidth]);

  const fontSize = Math.max(9, Math.round(tileSize * 0.45));
  const punctWidth = Math.max(8, Math.round(tileSize * 0.4));
  const wordGap = tileSize >= 28 ? 14 : 10;

  const highlightSet = useMemo(
    () => highlightCharIndices ? new Set(highlightCharIndices) : null,
    [highlightCharIndices]
  );

  let globalIdx = 0;

  return (
    <div className="flex flex-wrap justify-center" style={{ gap: `3px ${wordGap}px` }}>
      {upper.split(' ').map((word, wi) => {
        const startIdx = globalIdx;
        const wordEl = (
          <div key={wi} className="flex" style={{ flexWrap: 'nowrap', gap: TILE_GAP_SM }}>
            {[...word].map((ch, ci) => {
              const idx = startIdx + ci;
              const tileClass = highlightSet?.has(idx)
                ? 'border-amber-500 bg-amber-500 text-white'
                : defaultTileClass;
              return isLetter(ch) ? (
                <div
                  key={ci}
                  className={`flex items-center justify-center font-bold font-sans border-2 select-none ${tileClass}`}
                  style={{ width: tileSize, height: tileSize, fontSize }}
                >
                  {ch}
                </div>
              ) : (
                <div
                  key={ci}
                  className="flex items-center justify-center font-bold font-sans select-none"
                  style={{ color: '#9a8e80', width: punctWidth, height: tileSize, fontSize }}
                >
                  {ch}
                </div>
              );
            })}
          </div>
        );
        globalIdx += word.length + 1; // +1 for space
        return wordEl;
      })}
    </div>
  );
}

const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfMfOdWWxLrYf5WOqJWpNvW7porrQteNyYFRV1BowaoYL6heQ/viewform?usp=dialog';
const FEEDBACK_KEY = 'fourbe-feedback-given';

const MAX_ROUND_SCORE = 1000;

function formatDate(): string {
  const d = new Date();
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// --- Share icon SVG (box with arrow) ---
function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

// --- Lock icon SVG ---
function LockIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 24 28" fill="currentColor" className="inline-block shrink-0">
      <path d="M20 12V10c0-4.4-3.6-8-8-8S4 5.6 4 10v2H2v14h20V12h-2zm-12-2c0-2.2 1.8-4 4-4s4 1.8 4 4v2H8v-2z"/>
    </svg>
  );
}

// --- Animated counter hook ---
function useCountUp(target: number, duration: number, active: boolean): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) { setValue(0); return; }
    const startTime = performance.now();
    let raf: number;
    const tick = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - (1 - progress) * (1 - progress);
      setValue(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);

  return value;
}

// --- Score bar component ---
function ScoreBar({
  label,
  score,
  maxScore,
  colorClass,
  delay,
  active,
  lives,
}: {
  label: string;
  score: number;
  maxScore: number;
  colorClass: string;
  delay: number;
  active: boolean;
  lives?: number;
}) {
  const pct = Math.max(0, (score / maxScore) * 100);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setAnimated(true), delay);
    return () => clearTimeout(timer);
  }, [delay, active]);

  return (
    <div
      className="flex items-center gap-3"
      style={{
        opacity: animated ? 1 : 0,
        transition: 'opacity 0.3s ease-out',
      }}
    >
      <span className="text-xs font-medium w-16 text-right shrink-0 tabular-nums" style={{ color: '#6b5e50' }}>
        {label}
      </span>
      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: '#e8e2d9' }}>
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{
            width: animated ? `${Math.max(pct, score > 0 ? 3 : 0)}%` : '0%',
            transition: 'width 0.6s ease-out',
          }}
        />
      </div>
      {lives != null && (
        <span className="flex gap-[3px] shrink-0">
          {Array.from({ length: 4 }, (_, i) => (
            <span
              key={i}
              className={`inline-block w-[7px] h-[7px] rounded-full ${
                i < lives ? 'bg-[#1a1a1b]' : 'border border-[#c9bfb0]'
              }`}
            />
          ))}
        </span>
      )}
      <span className="text-xs font-medium w-14 tabular-nums" style={{ color: '#9a8e80' }}>
        {score > 0 ? score.toLocaleString() : '0'}
      </span>
    </div>
  );
}

function LeaveConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="shadow-lg p-6 mx-4 max-w-xs w-full text-center animate-fade-in"
        style={{ background: '#F8F5F0' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg font-semibold mb-1" style={{ color: '#1a1a1b' }}>Leave game?</p>
        <p className="text-sm mb-5" style={{ color: '#6b5e50' }}>Your progress will be lost.</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-semibold cursor-pointer transition-colors"
            style={{ background: '#e8e2d9', color: '#6b5e50' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 text-sm font-semibold cursor-pointer transition-colors"
            style={{ background: '#1a1a1b', color: '#F8F5F0' }}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GameSession({ puzzle, dateSelector, nextPuzzleDate, onNextPuzzle }: { puzzle: Puzzle; dateSelector?: React.ReactNode; nextPuzzleDate?: string | null; onNextPuzzle?: () => void }) {
  const availableWidth = useAvailableWidth();
  const [phase, setPhase] = useState<SessionPhase>('start');
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);

  // Final round state
  const [finalResult, setFinalResult] = useState<RoundResult | null>(null);
  const finalScore = finalResult?.score ?? 0;

  // Hint state
  const [hintsUsed, setHintsUsed] = useState(0);
  const [finalLives, setFinalLives] = useState(MAX_LIVES);
  const gameRoundRef = useRef<GameRoundHandle>(null);

  // Share button state
  const [shareText, setShareText] = useState('Share');

  // Feedback state
  const [feedbackGiven, setFeedbackGiven] = useState(() => localStorage.getItem(FEEDBACK_KEY) === 'true');

  // How to Play modal
  const [showHtp, setShowHtp] = useState(() => !localStorage.getItem(HTP_SEEN_KEY));
  const closeHtp = useCallback(() => {
    setShowHtp(false);
    localStorage.setItem(HTP_SEEN_KEY, '1');
  }, []);

  // Leave-game confirmation modal
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Reveal animation step (0 = nothing visible, 1-6 = staggered elements)
  const [revealStep, setRevealStep] = useState(0);

  const round = puzzle.rounds[currentRoundIdx];
  const runningScore = results.reduce((sum, r) => sum + r.score, 0);
  const totalScore = runningScore + finalScore;

  // Must be called unconditionally to satisfy React hook rules
  const animatedTotal = useCountUp(totalScore, 800, revealStep >= 3);

  const handleRoundComplete = useCallback((result: RoundResult) => {
    setResults((prev) => [...prev, result]);

    if (currentRoundIdx < 3) {
      setCurrentRoundIdx((prev) => prev + 1);
      setPhase('playing');
    } else {
      setPhase('final-round');
    }
  }, [currentRoundIdx]);

  // --- Final round completion → reveal ---
  const handleFinalRoundComplete = useCallback((result: RoundResult) => {
    setFinalResult(result);
    setPhase('reveal');

    // Fire-and-forget analytics
    const roundScore = results.reduce((s, r) => s + r.score, 0);
    trackGameResult({
      puzzle: puzzle.subject,
      r1Score: results[0]?.score ?? 0,
      r1Lives: results[0]?.lives ?? 0,
      r2Score: results[1]?.score ?? 0,
      r2Lives: results[1]?.lives ?? 0,
      r3Score: results[2]?.score ?? 0,
      r3Lives: results[2]?.lives ?? 0,
      r4Score: results[3]?.score ?? 0,
      r4Lives: results[3]?.lives ?? 0,
      finalGuess: puzzle.subject,
      judgment: result.solved ? 'Solved' : 'Failed',
      finalScore: result.score,
      totalScore: roundScore + result.score,
    });
  }, [puzzle, results]);

  // --- Hint handlers ---
  const handleHint1 = useCallback(() => {
    if (hintsUsed >= 1 || !gameRoundRef.current) return;
    if (!gameRoundRef.current.deductLife()) return;
    setHintsUsed(1);
  }, [hintsUsed]);

  const handleHint2 = useCallback(() => {
    if (hintsUsed < 1 || hintsUsed >= 2 || !gameRoundRef.current) return;
    if (!gameRoundRef.current.deductLife()) return;
    setHintsUsed(2);
  }, [hintsUsed]);

  const handleHint3 = useCallback(() => {
    if (hintsUsed < 2 || hintsUsed >= 3 || !gameRoundRef.current) return;
    if (!gameRoundRef.current.deductLife()) return;
    gameRoundRef.current.addGuessedLetters(['A', 'E', 'I', 'O', 'U']);
    setHintsUsed(3);
  }, [hintsUsed]);

  // --- Reveal stagger ---
  useEffect(() => {
    if (phase !== 'reveal') {
      setRevealStep(0);
      return;
    }
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setRevealStep(1), 0));
    timers.push(window.setTimeout(() => setRevealStep(2), 300));
    timers.push(window.setTimeout(() => setRevealStep(3), 1000));
    timers.push(window.setTimeout(() => setRevealStep(4), 1300));
    timers.push(window.setTimeout(() => setRevealStep(5), 1600));

    // Play sound based on final round result
    if (finalResult?.solved) playPerfectJingle();
    else playFailSound();

    return () => timers.forEach(clearTimeout);
  }, [phase]);

  // --- "Fourbe" nav click → return to start (with confirmation if mid-game) ---
  useEffect(() => {
    const handleGoHome = () => {
      if (phase === 'playing' || phase === 'final-round') {
        setShowLeaveConfirm(true);
      } else {
        handlePlayAgain();
      }
    };
    window.addEventListener('fourbe-go-home', handleGoHome);
    return () => window.removeEventListener('fourbe-go-home', handleGoHome);
  }, [phase]);

  // --- Share handler ---
  const handleShare = async () => {
    // Lives dots per round
    const roundDots = results.map((r) => {
      const filled = r.lives ?? 0;
      return '\u25CF'.repeat(filled) + '\u25CB'.repeat(4 - filled);
    });
    // Final round lives dots
    const finalDots = finalResult
      ? '\u25CF'.repeat(finalResult.lives ?? 0) + '\u25CB'.repeat(4 - (finalResult.lives ?? 0))
      : '\u25CB\u25CB\u25CB\u25CB';

    // Hint usage line
    const hintNames = [hintsUsed >= 1 && 'Category', hintsUsed >= 2 && 'Connections', hintsUsed >= 3 && 'Vowels'].filter(Boolean);
    const hintLine = hintNames.length > 0 ? `\nHints: ${hintNames.join(', ')}` : '';

    const text = `Fourbe \u2014 ${formatDate()}\n${roundDots.join(' ')} ${finalDots}${hintLine}\n${totalScore.toLocaleString()} pts`;

    try {
      await navigator.clipboard.writeText(text);
      setShareText('Copied!');
      setTimeout(() => setShareText('Share'), 2000);
    } catch {
      setShareText('Copied!');
      setTimeout(() => setShareText('Share'), 2000);
    }
  };

  // --- Play again ---
  const handlePlayAgain = () => {
    setPhase('start');
    setCurrentRoundIdx(0);
    setResults([]);
    setFinalResult(null);
    setHintsUsed(0);
    setFinalLives(MAX_LIVES);
    setShareText('Share');
  };

  // ===========================================
  // START SCREEN
  // ===========================================
  if (phase === 'start') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-52px)]">
        <div className="flex flex-col items-center w-full max-w-sm" style={{ gap: '0px' }}>
          {/* Newspaper masthead */}
          <hr className="fb-rule w-full" />
          <div className="py-3 w-full text-center">
            <FourbeLogo />
            <h1
              className="tracking-tight text-[#1a1a1b] mt-4"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 56, lineHeight: 1 }}
            >
              Fourbe
            </h1>
          </div>
          <hr className="fb-rule-double w-full" />

          {/* Tagline & date */}
          <p
            className="text-center mt-4"
            style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: '#6b5e50', fontStyle: 'italic' }}
          >
            Four clues. Five answers.
          </p>
          <p className="text-sm mt-1" style={{ color: '#9a8e80' }}>
            {formatDate()}
          </p>

          {/* Play button */}
          <button
            onClick={() => setPhase('playing')}
            className="w-full py-4 text-lg font-semibold cursor-pointer transition-colors mt-6"
            style={{
              background: '#1a1a1b',
              color: '#F8F5F0',
              border: '2px solid #1a1a1b',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Play
          </button>
          {dateSelector}
          <button
            onClick={() => setShowHtp(true)}
            className="text-xs cursor-pointer transition-colors mt-3"
            style={{ color: '#9a8e80' }}
          >
            How to Play
          </button>
        </div>
        {showHtp && <HowToPlayModal onClose={closeHtp} />}
      </div>
    );
  }

  // ===========================================
  // PLAYING (rounds 1-4)
  // ===========================================
  if (phase === 'playing') {
    return (
      <>
        <GameRound
          key={currentRoundIdx}
          round={round}
          runningScore={runningScore}
          onRoundComplete={handleRoundComplete}
        />
        {showLeaveConfirm && (
          <LeaveConfirmModal
            onConfirm={() => { setShowLeaveConfirm(false); handlePlayAgain(); }}
            onCancel={() => setShowLeaveConfirm(false)}
          />
        )}
      </>
    );
  }

  // ===========================================
  // FINAL ROUND — hangman for the subject
  // ===========================================
  if (phase === 'final-round') {
    const finalRound: Round = {
      clue: '',
      answer: puzzle.subject.toUpperCase(),
      connection: '',
      connectionCharIndices: [],
      round: 5,
    };

    // Hint button styling helper
    const hintBtnClass = (hintNum: number) => {
      const isUsed = hintsUsed >= hintNum;
      const isLocked = hintsUsed < hintNum - 1;
      const isActive = hintsUsed === hintNum - 1;
      const noLives = finalLives <= 0;

      if (isUsed) return 'bg-[#efe9e0] text-[#9a8e80] border-[#d4c8b8] cursor-default';
      if (isLocked) return 'bg-[#f3ede5] text-[#c9bfb0] border-[#e8e2d9] cursor-default';
      if (noLives) return 'bg-[#f3ede5] text-[#c9bfb0] border-[#e8e2d9] cursor-not-allowed';
      if (isActive) return 'bg-[#F8F5F0] text-[#1a1a1b] border-[#c9bfb0] hover:bg-[#efe9e0] cursor-pointer';
      return 'bg-[#f3ede5] text-[#c9bfb0] border-[#e8e2d9] cursor-default';
    };

    const isHintDisabled = (hintNum: number) => {
      if (hintsUsed >= hintNum) return true;
      if (hintsUsed < hintNum - 1) return true;
      if (finalLives <= 0) return true;
      return false;
    };

    const finalHeaderContent = (
      <div className="w-full max-w-md mb-2">
        {/* 4 compact answers — 2×2 grid on wider, stacked on narrow */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3" style={{ gridTemplateColumns: availableWidth >= 340 ? '1fr 1fr' : '1fr' }}>
          {puzzle.rounds.map((r, i) => {
            const result = results[i];
            const solved = result?.solved ?? false;
            const upper = r.answer.toUpperCase();
            const highlightSet = (hintsUsed >= 2 && (r.connectionCharIndices ?? []).length > 0)
              ? new Set(r.connectionCharIndices)
              : null;
            const greenClass = solved ? 'text-player' : 'text-[#9a8e80]';
            return (
              <div key={i} className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide leading-tight break-words">
                  <span className="text-[10px] font-medium mr-1" style={{ color: '#c9bfb0' }}>{i + 1}</span>
                  {[...upper].map((ch, ci) =>
                    highlightSet?.has(ci)
                      ? <span key={ci} style={{ color: '#E8530E' }}>{ch}</span>
                      : <span key={ci} className={greenClass}>{ch}</span>
                  )}
                </p>
                <p className="text-[10px] italic leading-tight mt-0.5" style={{ color: '#9a8e80' }}>{r.clue}</p>
                {hintsUsed >= 2 && r.connection && (
                  <p className="text-[10px] leading-tight mt-0.5" style={{ color: '#E8530E' }}>{r.connection}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Hint buttons */}
        <div className="flex gap-1.5 mb-1">
          <button
            type="button"
            onClick={handleHint1}
            disabled={isHintDisabled(1)}
            className={`flex-1 px-1.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors text-center ${hintBtnClass(1)}`}
          >
            {hintsUsed >= 1 ? (
              <span>Category<br /><span className="text-[10px] font-normal">{puzzle.subjectCategory || '???'}</span></span>
            ) : (
              <span>Category<br /><span className="text-[10px] font-normal" style={{ color: '#9a8e80' }}>-1 life</span></span>
            )}
          </button>
          <button
            type="button"
            onClick={handleHint2}
            disabled={isHintDisabled(2)}
            className={`flex-1 px-1.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors text-center ${hintBtnClass(2)}`}
          >
            {hintsUsed >= 2 ? (
              <span>Connections<br /><span className="text-[10px] font-normal">Revealed</span></span>
            ) : (
              <span className="flex items-center justify-center gap-1">
                {hintsUsed < 1 && <LockIcon />}
                Connections
              </span>
            )}
            {hintsUsed < 2 && <span className="block text-[10px] font-normal" style={{ color: '#9a8e80' }}>-1 life</span>}
          </button>
          <button
            type="button"
            onClick={handleHint3}
            disabled={isHintDisabled(3)}
            className={`flex-1 px-1.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors text-center ${hintBtnClass(3)}`}
          >
            {hintsUsed >= 3 ? (
              <span>Vowels<br /><span className="text-[10px] font-normal">Placed</span></span>
            ) : (
              <span className="flex items-center justify-center gap-1">
                {hintsUsed < 2 && <LockIcon />}
                Vowels
              </span>
            )}
            {hintsUsed < 3 && <span className="block text-[10px] font-normal" style={{ color: '#9a8e80' }}>-1 life</span>}
          </button>
        </div>

        {/* Category display when hint 1 is used */}
        {hintsUsed >= 1 && (
          <p className="text-xs font-medium text-center mt-1 mb-0.5" style={{ color: '#6b5e50' }}>
            Category: <span style={{ color: '#1a1a1b' }}>{puzzle.subjectCategory || '???'}</span>
          </p>
        )}
      </div>
    );

    return (
      <>
        <GameRound
          ref={gameRoundRef}
          round={finalRound}
          runningScore={runningScore}
          onRoundComplete={handleFinalRoundComplete}
          onLivesChange={setFinalLives}
          label="Fourbe"
          hideClue
          compact
          headerContent={finalHeaderContent}
        />
        {showLeaveConfirm && (
          <LeaveConfirmModal
            onConfirm={() => { setShowLeaveConfirm(false); handlePlayAgain(); }}
            onCancel={() => setShowLeaveConfirm(false)}
          />
        )}
      </>
    );
  }

  // ===========================================
  // REVEAL SCREEN
  // ===========================================

  const finalSolved = finalResult?.solved ?? false;
  const fourbeBarColor = finalSolved ? 'bg-player' : 'bg-[#c9bfb0]';

  const fadeUp = (step: number) => ({
    opacity: revealStep >= step ? 1 : 0,
    transform: revealStep >= step ? 'translateY(0)' : 'translateY(8px)',
    transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
  });

  return (
    <div className="flex flex-col items-center pt-8 pb-16 min-h-[calc(100vh-52px)]">

      {/* 1. THE SUBJECT — newspaper headline reveal */}
      <div
        className="w-full max-w-md text-center"
        style={{
          opacity: revealStep >= 1 ? 1 : 0,
          transform: revealStep >= 1 ? 'scale(1)' : 'scale(0.85)',
          transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
        }}
      >
        <hr className="fb-rule" />
        <h2
          className="py-4"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 36,
            color: '#1a1a1b',
            lineHeight: 1.1,
          }}
        >
          {puzzle.subject}
        </h2>
        <hr className="fb-rule-double" />
      </div>

      <div className="h-8" style={fadeUp(1)} />

      {/* 2. ROUND SCORE BARS (all 5) */}
      <div
        className="w-full max-w-sm space-y-2.5 mb-8"
        style={fadeUp(2)}
      >
        {puzzle.rounds.map((r, i) => {
          const result = results[i];
          const score = result?.score ?? 0;
          const solved = result?.solved ?? false;
          return (
            <ScoreBar
              key={i}
              label={`Round ${r.round}`}
              score={score}
              maxScore={MAX_ROUND_SCORE}
              colorClass={solved ? 'bg-player' : 'bg-[#c9bfb0]'}
              delay={i * 100}
              active={revealStep >= 2}
              lives={result?.lives ?? 0}
            />
          );
        })}
        <ScoreBar
          label="Final"
          score={finalScore}
          maxScore={MAX_ROUND_SCORE}
          colorClass={fourbeBarColor}
          delay={400}
          active={revealStep >= 2}
          lives={finalResult?.lives ?? 0}
        />
      </div>

      {/* 3. TOTAL SCORE */}
      <div
        className="text-center mb-10"
        style={fadeUp(3)}
      >
        <p className="tabular-nums mb-1" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 48, color: '#1a1a1b' }}>
          {animatedTotal.toLocaleString()}
        </p>
        <p className="text-sm" style={{ color: '#9a8e80', fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>total points</p>
      </div>

      {/* 4. ROUND DETAIL CARDS */}
      <div
        className="w-full max-w-md mb-10"
        style={fadeUp(4)}
      >
        {puzzle.rounds.map((r, i) => {
          const result = results[i];
          const solved = result?.solved ?? false;
          const roundScore = result?.score ?? 0;
          const charIndices = (r.connectionCharIndices ?? []).length > 0 ? r.connectionCharIndices : undefined;
          return (
            <div key={i}>
              {i > 0 && <hr className="fb-rule-thin my-4" />}
              <div className="flex items-baseline justify-between mb-2">
                <span
                  className="text-xs font-medium uppercase tracking-wider"
                  style={{ color: solved ? '#4a7c3f' : '#9a8e80' }}
                >
                  Round {r.round}
                </span>
                <span className="text-xs font-medium tabular-nums" style={{ color: '#9a8e80' }}>
                  {roundScore > 0 ? roundScore.toLocaleString() : '0'} pts
                </span>
              </div>
              <AnswerTileRow answer={r.answer} variant={solved ? 'solved' : 'failed'} availableWidth={availableWidth} highlightCharIndices={charIndices} />
              <p
                className="text-sm italic mt-2"
                style={{ fontFamily: 'var(--font-serif)', color: solved ? '#4a7c3f' : '#9a8e80' }}
              >
                {r.connection}
              </p>
            </div>
          );
        })}

        {/* Final Round detail */}
        <hr className="fb-rule-thin my-4" />
        <div className="flex items-baseline justify-between mb-2">
          <span
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: finalSolved ? '#4a7c3f' : '#9a8e80' }}
          >
            Final Round
          </span>
          <span className="text-xs font-medium tabular-nums" style={{ color: '#9a8e80' }}>
            {finalScore > 0 ? finalScore.toLocaleString() : '0'} pts
          </span>
        </div>
        <AnswerTileRow answer={puzzle.subject} variant={finalSolved ? 'solved' : 'failed'} availableWidth={availableWidth} />
        {hintsUsed > 0 && (
          <p className="text-xs mt-2 text-center" style={{ color: '#9a8e80' }}>
            Hints used: {[hintsUsed >= 1 && 'Category', hintsUsed >= 2 && 'Connections', hintsUsed >= 3 && 'Vowels'].filter(Boolean).join(', ')}
          </p>
        )}
      </div>

      {/* 5. ACTION BUTTONS */}
      <div
        className="w-full max-w-sm"
        style={fadeUp(5)}
      >
        {/* FEEDBACK */}
        {feedbackGiven ? (
          <a
            href={FEEDBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full mb-3 text-sm cursor-pointer transition-colors text-center"
            style={{ color: '#9a8e80' }}
          >
            Give More Feedback
          </a>
        ) : (
          <a
            href={FEEDBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              localStorage.setItem(FEEDBACK_KEY, 'true');
              setFeedbackGiven(true);
            }}
            className="w-full mb-3 py-4 text-base font-semibold cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            style={{ background: '#1a1a1b', color: '#F8F5F0' }}
          >
            Give Feedback — Help Shape Fourbe!
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        )}

        {/* NEXT PUZZLE */}
        {onNextPuzzle && (
          <button
            onClick={nextPuzzleDate ? onNextPuzzle : undefined}
            disabled={!nextPuzzleDate}
            className="w-full mb-3 py-3.5 text-base font-semibold transition-colors flex items-center justify-center cursor-pointer"
            style={nextPuzzleDate
              ? { background: '#1a1a1b', color: '#F8F5F0', border: '2px solid #1a1a1b' }
              : { background: '#e8e2d9', color: '#9a8e80', border: '2px solid #e8e2d9', cursor: 'not-allowed' }
            }
          >
            {nextPuzzleDate ? 'Next Puzzle \u2192' : 'No more puzzles'}
          </button>
        )}

        {/* SHARE */}
        <button
          onClick={handleShare}
          className="w-full py-3.5 text-base font-semibold cursor-pointer transition-colors flex items-center justify-center gap-2"
          style={{ border: '2px solid #1a1a1b', color: '#1a1a1b', background: 'transparent' }}
        >
          <ShareIcon />
          {shareText}
        </button>

        {/* PLAY AGAIN */}
        <button
          onClick={handlePlayAgain}
          className="w-full mt-4 text-sm cursor-pointer transition-colors text-center"
          style={{ color: '#9a8e80' }}
        >
          Play Again
        </button>
      </div>
    </div>
  );
}
