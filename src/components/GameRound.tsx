import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Round, RoundResult } from '../types';
import { getRevealedAtChunk } from '../lib/reveal';

const ROUND_DURATION = 30;
const JUMP_DURATION_MS = 300;
const CHUNK_BOUNDARIES = [30, 24, 18, 12, 6, 0];

type RoundState = 'playing' | 'won' | 'lost';

const KB_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M'],
];

/** Map time remaining to reveal level (0 = no reveals, 4 = all four reveals fired). */
function getRevealLevel(t: number): number {
  if (t > 24) return 0;
  if (t > 18) return 1;
  if (t > 12) return 2;
  if (t > 6) return 3;
  return 4;
}

interface GameRoundProps {
  round: Round;
  runningScore?: number;
  onRoundComplete?: (result: RoundResult) => void;
}

export default function GameRound({ round, runningScore = 0, onRoundComplete }: GameRoundProps) {
  const [timeRemaining, setTimeRemaining] = useState(ROUND_DURATION);
  const [state, setState] = useState<RoundState>('playing');
  const [guessedLetters, setGuessedLetters] = useState<Set<string>>(new Set());
  const [wrongGuessedLetters, setWrongGuessedLetters] = useState<Set<string>>(new Set());
  const [score, setScore] = useState(0);
  const [popCells, setPopCells] = useState<Set<number>>(new Set());
  const [wobbleKey, setWobbleKey] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(performance.now());

  // Chunk jump animation state (ref so tick callback can read it)
  const jumpRef = useRef<{ startTime: number; from: number; to: number } | null>(null);
  // Mirror of timeRemaining for synchronous reads in event handlers
  const timeRef = useRef(ROUND_DURATION);

  const upper = round.answer.toUpperCase();
  const revealLevel = getRevealLevel(timeRemaining);
  const autoRevealed = getRevealedAtChunk(round.answer, revealLevel, guessedLetters);

  // Compute which unique letters are auto-revealed (for keyboard coloring)
  const autoRevealedLetters = new Set<string>();
  for (let i = 0; i < upper.length; i++) {
    if (autoRevealed[i] && upper[i] !== ' ') autoRevealedLetters.add(upper[i]);
  }

  // Merge auto-revealed + player guessed to determine all visible letters
  const visibleLetters = new Set<string>();
  for (const l of guessedLetters) visibleLetters.add(l);
  for (const l of autoRevealedLetters) visibleLetters.add(l);

  // Build reveal mask for each position
  const revealMask = [...upper].map((ch) => {
    if (ch === ' ') return false;
    return visibleLetters.has(ch);
  });

  // --- Timer with chunk jump support ---
  const tick = useCallback(() => {
    const now = performance.now();
    let newTime: number;

    if (jumpRef.current) {
      const { startTime, from, to } = jumpRef.current;
      const progress = Math.min(1, (now - startTime) / JUMP_DURATION_MS);
      // Ease-out for natural deceleration
      const eased = 1 - (1 - progress) * (1 - progress);
      newTime = from + (to - from) * eased;

      if (progress >= 1) {
        jumpRef.current = null;
        lastTickRef.current = now;
      }
    } else {
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      newTime = timeRef.current - delta;
    }

    newTime = Math.max(0, newTime);
    timeRef.current = newTime;
    setTimeRemaining(newTime);

    if (newTime <= 0) {
      setState('lost');
      return; // Don't schedule next frame
    }

    timerRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    lastTickRef.current = performance.now();
    timerRef.current = requestAnimationFrame(tick);
    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    };
  }, [tick]);

  // Stop timer on end
  useEffect(() => {
    if (state !== 'playing' && timerRef.current) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }
  }, [state]);

  // Round-end transition: auto-advance after delay, or click to advance early
  const advancedRef = useRef(false);
  useEffect(() => {
    if (state === 'playing' || !onRoundComplete) return;
    advancedRef.current = false;

    const roundScore = state === 'won' ? score : 0;
    const result: RoundResult = { solved: state === 'won', score: roundScore, answer: round.answer, connection: round.connection };
    const delay = 2000;

    const timer = setTimeout(() => {
      if (!advancedRef.current) {
        advancedRef.current = true;
        onRoundComplete(result);
      }
    }, delay);

    const handleClick = () => {
      if (!advancedRef.current) {
        advancedRef.current = true;
        onRoundComplete(result);
      }
    };

    // Small delay before enabling click-to-advance to prevent accidental taps
    const clickTimer = setTimeout(() => {
      window.addEventListener('click', handleClick);
    }, 300);

    return () => {
      clearTimeout(timer);
      clearTimeout(clickTimer);
      window.removeEventListener('click', handleClick);
    };
  }, [state, score, round.answer, onRoundComplete]);

  // --- Chunk jump trigger (snap to next chunk boundary) ---
  const triggerChunkJump = useCallback(() => {
    // Read current position (mid-jump or normal)
    let currentTime: number;
    if (jumpRef.current) {
      const { startTime, from, to } = jumpRef.current;
      const progress = Math.min(1, (performance.now() - startTime) / JUMP_DURATION_MS);
      const eased = 1 - (1 - progress) * (1 - progress);
      currentTime = from + (to - from) * eased;
    } else {
      currentTime = timeRef.current;
    }

    // Find the next chunk boundary below currentTime
    let jumpTo = 0;
    for (const boundary of CHUNK_BOUNDARIES) {
      if (boundary < currentTime) {
        jumpTo = boundary;
        break;
      }
    }

    jumpRef.current = { startTime: performance.now(), from: currentTime, to: jumpTo };
  }, []);

  // --- Letter guess logic ---
  const handleLetterGuess = useCallback((key: string) => {
    if (state !== 'playing') return;
    if (visibleLetters.has(key)) return;

    const isInAnswer = upper.includes(key);

    if (isInAnswer) {
      const newGuessed = new Set(guessedLetters);
      newGuessed.add(key);
      setGuessedLetters(newGuessed);

      const newPops = new Set<number>();
      for (let i = 0; i < upper.length; i++) {
        if (upper[i] === key) newPops.add(i);
      }
      setPopCells(newPops);
      setTimeout(() => setPopCells(new Set()), 300);

      // Auto-solve: check if this guess completed all positions
      const newVisible = new Set(newGuessed);
      for (const l of autoRevealedLetters) newVisible.add(l);
      const complete = [...upper].every((ch) => ch === ' ' || newVisible.has(ch));
      if (complete) {
        setState('won');
        setScore(Math.round((timeRef.current / ROUND_DURATION) * 1000));
      }
    } else {
      // Already guessed this wrong letter? Ignore.
      if (wrongGuessedLetters.has(key)) return;

      const newWrong = new Set(wrongGuessedLetters);
      newWrong.add(key);
      setWrongGuessedLetters(newWrong);
      setWobbleKey(key);
      setTimeout(() => setWobbleKey(null), 200);
      triggerChunkJump();
    }
  }, [state, guessedLetters, visibleLetters, upper, wrongGuessedLetters, triggerChunkJump]);

  // --- Physical keyboard handler ---
  useEffect(() => {
    if (state !== 'playing') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      if (key.length !== 1 || key < 'A' || key > 'Z') return;
      e.preventDefault();
      handleLetterGuess(key);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, handleLetterGuess]);

  // --- Timer segments (deplete right to left) ---
  const segBoundaries = CHUNK_BOUNDARIES;
  const segments = [4, 3, 2, 1, 0].map((seg) => {
    const segStart = segBoundaries[seg];
    const segEnd = segBoundaries[seg + 1];
    const segDur = segStart - segEnd;
    const elapsed = Math.max(0, segStart - timeRemaining);
    const fill = state === 'won' ? 1 : state === 'lost' ? 0 : Math.max(0, 1 - elapsed / segDur);
    return { seg, fill };
  });

  const displayScore = state === 'won' ? score.toLocaleString() : '0';

  // --- Determine tile color for each position ---
  function tileClass(ch: string, _i: number): string {
    if (ch === ' ') return '';

    if (state === 'won') {
      if (guessedLetters.has(ch)) return 'border-player bg-player text-white';
      return 'border-auto bg-auto-fill text-auto-text';
    }

    if (state === 'lost') {
      // Keep partial reveals — don't expose hidden letters
      if (!revealMask[_i]) return 'border-gray-300 bg-gray-100';
      if (guessedLetters.has(ch)) return 'border-player bg-player text-white';
      return 'border-auto bg-auto-fill text-auto-text';
    }

    // Playing state — unrevealed
    if (!revealMask[_i]) return 'border-gray-300 bg-white';

    if (guessedLetters.has(ch)) {
      return 'border-player bg-player text-white';
    }
    return 'border-auto bg-white text-auto-text';
  }

  // --- Keyboard key color ---
  function keyClasses(letter: string): string {
    const base = 'flex items-center justify-center rounded-md text-sm font-semibold font-sans border transition-colors cursor-pointer disabled:cursor-default';

    if (guessedLetters.has(letter)) {
      return `${base} bg-player border-player text-white`;
    }
    if (wrongGuessedLetters.has(letter)) {
      return `${base} bg-gray-500 border-gray-500 text-white`;
    }
    if (autoRevealedLetters.has(letter)) {
      return `${base} bg-white border-auto text-auto-text border-2`;
    }
    return `${base} bg-gray-100 border-gray-200 text-gray-800 hover:bg-gray-200 active:bg-gray-300`;
  }

  return (
    <div className="flex flex-col items-center pt-6 pb-16 min-h-[calc(100vh-52px)] relative">
      {/* Running score */}
      {runningScore > 0 && (
        <div className="absolute top-2 right-0 text-sm text-gray-300 tabular-nums font-sans">
          {runningScore.toLocaleString()}
        </div>
      )}

      {/* Round label — always top */}
      <div className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">
        Round {round.round}
      </div>

      {/* Clue — fixed at top, never centered vertically */}
      <h2 className="font-serif text-xl text-center text-gray-700 italic mb-3 max-w-md leading-relaxed min-h-[2.5rem]">
        {round.clue}
      </h2>

      {/* Letter board — words never split across lines */}
      <div className="mb-8">
        <div className="flex flex-wrap justify-center gap-[5px]" style={{ rowGap: '5px' }}>
          {upper.split(' ').reduce<{ elements: React.ReactNode[]; globalIdx: number }>(
            (acc, word, wi, arr) => {
              const startIdx = acc.globalIdx;
              const wordTiles = [...word].map((ch, li) => {
                const idx = startIdx + li;
                const isVisible = state === 'won' ? true : revealMask[idx];
                const isPop = popCells.has(idx);
                return (
                  <div
                    key={idx}
                    className={`w-11 h-11 flex items-center justify-center text-lg font-bold font-sans border-2 select-none transition-colors duration-150
                      ${isPop ? 'animate-pop' : ''}
                      ${tileClass(ch, idx)}
                    `}
                  >
                    {isVisible ? ch : ''}
                  </div>
                );
              });

              acc.elements.push(
                <div key={`word-${wi}`} className="flex gap-[5px]" style={{ flexWrap: 'nowrap' }}>
                  {wordTiles}
                </div>
              );
              if (wi < arr.length - 1) {
                acc.elements.push(<div key={`space-${wi}`} className="w-2" />);
              }
              acc.globalIdx += word.length + 1;
              return acc;
            },
            { elements: [], globalIdx: 0 }
          ).elements}
        </div>
      </div>

      {/* Timer bar — segments only, no numbers */}
      {state === 'playing' && (
        <div className="w-full max-w-xs mb-6">
          <div className="flex gap-1">
            {segments.map(({ seg, fill }) => (
              <div key={seg} className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-none ${
                    timeRemaining <= 6 ? 'bg-red-500' : timeRemaining <= 12 ? 'bg-amber-500' : 'bg-gray-800'
                  }`}
                  style={{ width: `${fill * 100}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* On-screen keyboard */}
      {state === 'playing' && (
        <div className="w-full max-w-md select-none">
          {KB_ROWS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-[6px] mb-[6px]">
              {row.map((letter) => {
                const isRevealed = visibleLetters.has(letter);
                const isWrong = wrongGuessedLetters.has(letter);
                const isWobbling = wobbleKey === letter;

                return (
                  <button
                    key={letter}
                    onClick={() => handleLetterGuess(letter)}
                    disabled={isRevealed || isWrong}
                    className={`w-9 h-11 ${keyClasses(letter)} ${isWobbling ? 'animate-wobble' : ''}`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Result state */}
      {state !== 'playing' && (
        <div className="text-center animate-fade-in mt-2">
          {state === 'won' ? (
            <>
              <div className="flex gap-1 mb-3 justify-center">
                {segments.map(({ seg }) => (
                  <div key={seg} className="flex-1 max-w-12 h-2 rounded-full bg-player" />
                ))}
              </div>
              <p className="text-3xl font-bold text-player mb-1">
                {displayScore}
              </p>
              <p className="text-sm text-gray-400">points</p>
            </>
          ) : (
            <>
              <div className="flex gap-1 mb-3 justify-center">
                {segments.map(({ seg }) => (
                  <div key={seg} className="flex-1 max-w-12 h-2 rounded-full bg-gray-200" />
                ))}
              </div>
              <p className="text-2xl font-bold text-gray-800 mb-1">Time!</p>
              <p className="text-sm text-gray-400">{displayScore} points</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
