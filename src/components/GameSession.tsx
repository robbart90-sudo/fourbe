import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Puzzle, RoundResult } from '../types';
import GameRound from './GameRound';
import { FourbeLogo } from './FourbeLogo';
import HowToPlayModal from './HowToPlayModal';
import { judgeGuess } from '../lib/judge';
import { playPerfectJingle, playKindOfSound, playFailSound } from '../lib/sounds';

const HTP_SEEN_KEY = 'fourbe-played-before';

type SessionPhase = 'start' | 'playing' | 'final-guess' | 'reveal';
type FinalJudgment = 'Perfect!' | 'Kind Of!' | 'Not Quite...' | 'Time!';

function isLetter(ch: string): boolean {
  return ch >= 'A' && ch <= 'Z';
}

// --- Shared tile row for displaying answers ---
function AnswerTileRow({ answer, variant }: { answer: string; variant: 'solved' | 'failed' }) {
  const upper = answer.toUpperCase();
  const tileClass = variant === 'solved'
    ? 'border-player bg-player text-white'
    : 'border-gray-300 bg-gray-100 text-gray-400';

  return (
    <div className="flex flex-wrap justify-start gap-[3px]" style={{ rowGap: '3px' }}>
      {upper.split(' ').map((word, wi, arr) => (
        <React.Fragment key={wi}>
          <div className="flex gap-[3px]" style={{ flexWrap: 'nowrap' }}>
            {[...word].map((ch, ci) =>
              isLetter(ch) ? (
                <div
                  key={ci}
                  className={`w-[36px] h-[36px] flex items-center justify-center font-bold font-sans border-2 select-none ${tileClass}`}
                  style={{ fontSize: 16 }}
                >
                  {ch}
                </div>
              ) : (
                <div
                  key={ci}
                  className="w-4 h-[36px] flex items-center justify-center font-bold font-sans text-gray-500 select-none"
                  style={{ fontSize: 16 }}
                >
                  {ch}
                </div>
              )
            )}
          </div>
          {wi < arr.length - 1 && <div className="w-1.5" />}
        </React.Fragment>
      ))}
    </div>
  );
}

const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfMfOdWWxLrYf5WOqJWpNvW7porrQteNyYFRV1BowaoYL6heQ/viewform?usp=dialog';
const FEEDBACK_KEY = 'fourbe-feedback-given';

const FINAL_GUESS_DURATION = 30;
const FINAL_GUESS_SEGMENTS = 5;
const FINAL_SEG_DURATION = FINAL_GUESS_DURATION / FINAL_GUESS_SEGMENTS;
const MAX_ROUND_SCORE = 1000;
const MAX_FOURBE_SCORE = 2000;

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
      <span className="text-xs font-medium text-gray-500 w-16 text-right shrink-0 tabular-nums">
        {label}
      </span>
      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
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
                i < lives ? 'bg-[#1a1a1b]' : 'border border-gray-300'
              }`}
            />
          ))}
        </span>
      )}
      <span className="text-xs font-medium text-gray-400 w-14 tabular-nums">
        {score > 0 ? score.toLocaleString() : '0'}
      </span>
    </div>
  );
}

export default function GameSession({ puzzle, dateSelector, nextPuzzleDate, onNextPuzzle }: { puzzle: Puzzle; dateSelector?: React.ReactNode; nextPuzzleDate?: string | null; onNextPuzzle?: () => void }) {
  const [phase, setPhase] = useState<SessionPhase>('start');
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);

  // Final guess state
  const [finalGuess, setFinalGuess] = useState('');
  const [finalTime, setFinalTime] = useState(FINAL_GUESS_DURATION);
  const [finalJudgment, setFinalJudgment] = useState<FinalJudgment | null>(null);
  const [finalScore, setFinalScore] = useState(0);

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

  // Reveal animation step (0 = nothing visible, 1-7 = staggered elements)
  const [revealStep, setRevealStep] = useState(0);

  const finalTimerRef = useRef<number | null>(null);
  const finalLastTickRef = useRef<number>(0);
  const finalTimeRef = useRef(FINAL_GUESS_DURATION);
  const finalInputRef = useRef<HTMLInputElement>(null);
  const finalSubmittedRef = useRef(false);

  const round = puzzle.rounds[currentRoundIdx];
  const runningScore = results.reduce((sum, r) => sum + r.score, 0);
  const totalScore = runningScore + finalScore;

  // Must be called unconditionally (above all early returns) to satisfy React hook rules
  const animatedTotal = useCountUp(totalScore, 800, revealStep >= 5);

  const handleRoundComplete = useCallback((result: RoundResult) => {
    setResults((prev) => [...prev, result]);

    if (currentRoundIdx < 3) {
      setCurrentRoundIdx((prev) => prev + 1);
      setPhase('playing');
    } else {
      setPhase('final-guess');
    }
  }, [currentRoundIdx]);

  // --- Final guess submission (instant judging → reveal) ---
  const handleFinalGuessSubmit = useCallback((guess: string) => {
    if (finalSubmittedRef.current) return;
    finalSubmittedRef.current = true;

    // Stop the timer immediately, no matter what
    if (finalTimerRef.current) {
      cancelAnimationFrame(finalTimerRef.current);
      finalTimerRef.current = null;
    }

    const trimmed = guess.trim();

    if (!trimmed) {
      setFinalJudgment('Time!');
      setFinalScore(0);
    } else {
      const result = judgeGuess(trimmed, puzzle);
      setFinalJudgment(result.judgment);
      setFinalScore(result.score);
    }

    setPhase('reveal');
  }, [puzzle]);

  // --- Final guess timer ---
  const finalTick = useCallback(() => {
    const now = performance.now();
    const delta = (now - finalLastTickRef.current) / 1000;
    finalLastTickRef.current = now;

    const newTime = Math.max(0, finalTimeRef.current - delta);
    finalTimeRef.current = newTime;
    setFinalTime(newTime);

    if (newTime <= 0) {
      handleFinalGuessSubmit(finalInputRef.current?.value ?? '');
      return;
    }

    finalTimerRef.current = requestAnimationFrame(finalTick);
  }, [handleFinalGuessSubmit]);

  useEffect(() => {
    if (phase !== 'final-guess') return;

    finalSubmittedRef.current = false;
    finalTimeRef.current = FINAL_GUESS_DURATION;
    setFinalTime(FINAL_GUESS_DURATION);
    setFinalGuess('');

    finalLastTickRef.current = performance.now();
    finalTimerRef.current = requestAnimationFrame(finalTick);

    return () => {
      if (finalTimerRef.current) cancelAnimationFrame(finalTimerRef.current);
    };
  }, [phase, finalTick]);

  useEffect(() => {
    if (phase === 'final-guess' && finalInputRef.current) {
      finalInputRef.current.focus();
    }
  }, [phase]);

  // --- Reveal stagger ---
  useEffect(() => {
    if (phase !== 'reveal') {
      setRevealStep(0);
      return;
    }
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setRevealStep(1), 0));
    timers.push(window.setTimeout(() => setRevealStep(2), 200));
    timers.push(window.setTimeout(() => setRevealStep(3), 500));
    timers.push(window.setTimeout(() => setRevealStep(4), 900));
    timers.push(window.setTimeout(() => setRevealStep(5), 1500));
    timers.push(window.setTimeout(() => setRevealStep(6), 1700));
    timers.push(window.setTimeout(() => setRevealStep(7), 2000));

    // Play judgment sound when results appear
    if (finalJudgment === 'Perfect!') playPerfectJingle();
    else if (finalJudgment === 'Kind Of!') playKindOfSound();
    else if (finalJudgment === 'Not Quite...') playFailSound();

    return () => timers.forEach(clearTimeout);
  }, [phase]);

  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleFinalGuessSubmit(finalGuess);
  };

  // --- Timer segments for final guess ---
  const finalSegBoundaries: number[] = [];
  for (let i = 0; i <= FINAL_GUESS_SEGMENTS; i++) {
    finalSegBoundaries.push(FINAL_GUESS_DURATION - i * FINAL_SEG_DURATION);
  }
  const finalSegments = [...Array(FINAL_GUESS_SEGMENTS)].map((_, idx) => {
    const seg = FINAL_GUESS_SEGMENTS - 1 - idx;
    const segStart = finalSegBoundaries[seg];
    const segEnd = finalSegBoundaries[seg + 1];
    const segDur = segStart - segEnd;
    const elapsed = Math.max(0, segStart - finalTime);
    const fill = Math.max(0, 1 - elapsed / segDur);
    return { seg, fill };
  });

  // --- Share handler ---
  const handleShare = async () => {
    // Lives dots per round
    const roundDots = results.map((r) => {
      const filled = r.lives ?? 0;
      return '\u25CF'.repeat(filled) + '\u25CB'.repeat(4 - filled);
    });
    // Final guess emoji
    let fourbeEmoji = '\u2B1C';
    if (finalJudgment === 'Perfect!') fourbeEmoji = '\u{1F7E9}';
    else if (finalJudgment === 'Kind Of!') fourbeEmoji = '\u{1F7E8}';

    const text = `Fourbe \u2014 ${formatDate()}\n${roundDots.join(' ')} ${fourbeEmoji}\n${totalScore.toLocaleString()} pts`;

    try {
      await navigator.clipboard.writeText(text);
      setShareText('Copied!');
      setTimeout(() => setShareText('Share'), 2000);
    } catch {
      // Fallback — select and copy
      setShareText('Copied!');
      setTimeout(() => setShareText('Share'), 2000);
    }
  };

  // --- Play again ---
  const handlePlayAgain = () => {
    setPhase('start');
    setCurrentRoundIdx(0);
    setResults([]);
    setFinalGuess('');
    setFinalTime(FINAL_GUESS_DURATION);
    setFinalJudgment(null);
    setFinalScore(0);
    setShareText('Share');
  };

  // ===========================================
  // START SCREEN
  // ===========================================
  if (phase === 'start') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-52px)]">
        <div className="flex flex-col items-center" style={{ gap: '20px' }}>
          <FourbeLogo />
          <h1 className="text-3xl tracking-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32 }}>
            Fourbe
          </h1>
          <p className="text-gray-500 text-base">
            Four clues. Five answers.
          </p>
          <p className="text-gray-400 text-sm">
            {formatDate()}
          </p>
          <button
            onClick={() => setPhase('playing')}
            className="w-full max-w-xs py-4 text-lg font-semibold bg-black text-white rounded-full cursor-pointer hover:bg-gray-900 transition-colors"
            style={{ marginTop: 12 }}
          >
            Play
          </button>
          {dateSelector}
          <button
            onClick={() => setShowHtp(true)}
            className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer transition-colors mt-1"
          >
            How to Play
          </button>
        </div>
        {showHtp && <HowToPlayModal onClose={closeHtp} />}
      </div>
    );
  }

  // ===========================================
  // PLAYING
  // ===========================================
  if (phase === 'playing') {
    return (
      <GameRound
        key={currentRoundIdx}
        round={round}
        runningScore={runningScore}
        onRoundComplete={handleRoundComplete}
      />
    );
  }

  // ===========================================
  // FINAL GUESS SCREEN
  // ===========================================
  if (phase === 'final-guess') {
    return (
      <div className="flex flex-col items-center pt-10 pb-16 min-h-[calc(100vh-52px)]">
        <h2 className="text-2xl text-gray-800 text-center mb-10" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26 }}>
          What's Today's Fourbe?
        </h2>

        <div className="w-full max-w-md mb-6">
          {puzzle.rounds.map((r, i) => {
            const result = results[i];
            const solved = result?.solved ?? false;
            return (
              <div key={i}>
                {i > 0 && <div className="h-px bg-gray-100 my-4" />}
                <div className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">
                  Round {r.round}
                </div>
                {solved ? (
                  <AnswerTileRow answer={r.answer} variant="solved" />
                ) : (
                  <p className="text-lg font-bold font-sans text-gray-300 tracking-wide">???</p>
                )}
              </div>
            );
          })}
        </div>

        <form onSubmit={handleFinalSubmit} className="w-full mb-4" style={{ maxWidth: 320 }}>
          <input
            ref={finalInputRef}
            type="text"
            value={finalGuess}
            onChange={(e) => setFinalGuess(e.target.value)}
            className="w-full py-3 px-4 font-sans font-bold text-center rounded-lg outline-none"
            style={{ fontSize: 18, border: '1.5px solid #b0b0b0', transition: 'border-color 0.15s' }}
            onFocus={(e) => { e.target.style.borderColor = '#1a1a1a'; }}
            onBlur={(e) => { e.target.style.borderColor = '#b0b0b0'; }}
          />
          <button
            type="submit"
            disabled={!finalGuess.trim()}
            className="w-full py-2.5 font-semibold bg-black text-white rounded-lg cursor-pointer hover:bg-gray-900 transition-colors mt-3"
            style={{
              fontSize: 15,
              opacity: finalGuess.trim() ? 1 : 0,
              pointerEvents: finalGuess.trim() ? 'auto' : 'none',
              transition: 'opacity 0.2s ease-out',
            }}
          >
            Submit
          </button>
        </form>

        <div className="w-full" style={{ maxWidth: 320 }}>
          <div className="flex gap-1">
            {finalSegments.map(({ seg, fill }) => (
              <div key={seg} className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-none ${
                    finalTime <= 6 ? 'bg-red-500' : finalTime <= 12 ? 'bg-amber-500' : 'bg-gray-800'
                  }`}
                  style={{ width: `${fill * 100}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ===========================================
  // REVEAL SCREEN — the climax
  // ===========================================

  const judgmentColor =
    finalJudgment === 'Perfect!' ? 'text-player' :
    finalJudgment === 'Kind Of!' ? 'text-kindof' :
    'text-gray-500';

  const fourbeBarColor =
    finalJudgment === 'Perfect!' ? 'bg-player' :
    finalJudgment === 'Kind Of!' ? 'bg-kindof' :
    'bg-gray-300';

  const fadeUp = (step: number) => ({
    opacity: revealStep >= step ? 1 : 0,
    transform: revealStep >= step ? 'translateY(0)' : 'translateY(8px)',
    transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
  });

  return (
    <div className="flex flex-col items-center pt-12 pb-16 min-h-[calc(100vh-52px)]">

      {/* 1. JUDGMENT WORD — biggest, boldest */}
      <p
        className={`text-5xl ${judgmentColor}`}
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 900,
          opacity: revealStep >= 1 ? 1 : 0,
          transform: revealStep >= 1 ? 'scale(1)' : 'scale(0.85)',
          transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
        }}
      >
        {finalJudgment}
      </p>
      <div className="mb-8" />

      {/* 2. THE SUBJECT */}
      <h2
        className="text-3xl text-gray-800"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 800, ...fadeUp(2) }}
      >
        {puzzle.subject}
      </h2>

      {/* Divider */}
      <div
        className="w-16 h-px bg-gray-200 my-8"
        style={fadeUp(2)}
      />

      {/* 3. FOURBE SCORE BAR — headline result, shown first */}
      <div
        className="w-full max-w-sm mb-6"
        style={fadeUp(3)}
      >
        <ScoreBar
          label="Fourbe"
          score={finalScore}
          maxScore={MAX_FOURBE_SCORE}
          colorClass={fourbeBarColor}
          delay={0}
          active={revealStep >= 3}
        />
      </div>

      {/* 4. ROUND SCORE BARS — grouped below */}
      <div
        className="w-full max-w-sm space-y-2.5 mb-8"
        style={fadeUp(4)}
      >
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider text-right pr-1 mb-1">Rounds</p>
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
              colorClass={solved ? 'bg-player' : 'bg-gray-300'}
              delay={i * 100}
              active={revealStep >= 4}
              lives={result?.lives ?? 0}
            />
          );
        })}
      </div>

      {/* 5. TOTAL SCORE */}
      <div
        className="text-center mb-10"
        style={fadeUp(5)}
      >
        <p className="text-5xl text-gray-800 tabular-nums mb-1" style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>
          {animatedTotal.toLocaleString()}
        </p>
        <p className="text-sm text-gray-400">total points</p>
      </div>

      {/* 6. ROUND DETAIL CARDS */}
      <div
        className="w-full max-w-md mb-10"
        style={fadeUp(6)}
      >
        {puzzle.rounds.map((r, i) => {
          const result = results[i];
          const solved = result?.solved ?? false;
          const roundScore = result?.score ?? 0;
          return (
            <div key={i}>
              {i > 0 && <div className="h-px bg-gray-100 my-4" />}
              <div className="flex items-baseline justify-between mb-2">
                <span className={`text-xs font-medium uppercase tracking-wider ${
                  solved ? 'text-green-600' : 'text-gray-400'
                }`}>
                  Round {r.round}
                </span>
                <span className="text-xs font-medium text-gray-400 tabular-nums">
                  {roundScore > 0 ? roundScore.toLocaleString() : '0'} pts
                </span>
              </div>
              <AnswerTileRow answer={r.answer} variant={solved ? 'solved' : 'failed'} />
              <p className={`text-sm italic mt-2 ${
                solved ? 'text-green-700' : 'text-gray-400'
              }`}>
                {r.connection}
              </p>
            </div>
          );
        })}
      </div>

      {/* 7. ACTION BUTTONS */}
      <div
        className="w-full max-w-sm"
        style={fadeUp(7)}
      >
        {/* FEEDBACK */}
        {feedbackGiven ? (
          <a
            href={FEEDBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full mb-3 text-sm text-gray-400 hover:text-gray-600 cursor-pointer transition-colors text-center"
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
            className="w-full mb-3 py-4 text-base font-semibold bg-player text-white rounded-full cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            Give Feedback — Help Shape Fourbe!
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        )}

        {/* SHARE */}
        <button
          onClick={handleShare}
          className="w-full py-3.5 text-base font-semibold bg-black text-white rounded-full cursor-pointer hover:bg-gray-900 transition-colors flex items-center justify-center gap-2"
        >
          <ShareIcon />
          {shareText}
        </button>

        {/* PLAY AGAIN */}
        <button
          onClick={handlePlayAgain}
          className="w-full mt-4 text-sm text-gray-400 hover:text-gray-600 cursor-pointer transition-colors text-center"
        >
          Play Again
        </button>

        {/* NEXT PUZZLE (playtesting) */}
        {onNextPuzzle && (
          <button
            onClick={nextPuzzleDate ? onNextPuzzle : undefined}
            disabled={!nextPuzzleDate}
            className={`w-full mt-2 text-sm transition-colors text-center ${
              nextPuzzleDate
                ? 'text-gray-400 hover:text-gray-600 cursor-pointer'
                : 'text-gray-300 cursor-not-allowed'
            }`}
          >
            {nextPuzzleDate ? 'Next Puzzle \u2192' : 'No more puzzles'}
          </button>
        )}
      </div>
    </div>
  );
}
