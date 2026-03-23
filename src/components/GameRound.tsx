import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import type { Round, RoundResult } from '../types';

const MAX_LIVES = 4;
const POINTS_PER_LIFE = 250;
const TILE_MAX = 44;
const TILE_MIN = 28;
const TILE_GAP = 5;
const ROOT_MAX_WIDTH = 600;
const ROOT_PADDING = 32; // #root padding: 0 1rem = 16px each side

function isLetter(ch: string): boolean {
  return ch >= 'A' && ch <= 'Z';
}

type RoundState = 'playing' | 'won' | 'lost';

const KB_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M'],
];

/** Available content width = min(viewport, #root max-width) - padding */
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

export interface GameRoundHandle {
  deductLife: () => boolean;
  addGuessedLetters: (letters: string[]) => void;
  getLives: () => number;
}

interface GameRoundProps {
  round: Round;
  runningScore?: number;
  onRoundComplete?: (result: RoundResult) => void;
  label?: string;
  hideClue?: boolean;
  headerContent?: React.ReactNode;
  onLivesChange?: (lives: number) => void;
  compact?: boolean;
}

const GameRound = forwardRef<GameRoundHandle, GameRoundProps>(function GameRound(
  { round, runningScore = 0, onRoundComplete, label, hideClue, headerContent, onLivesChange, compact },
  ref
) {
  const [state, setState] = useState<RoundState>('playing');
  const [guessedLetters, setGuessedLetters] = useState<Set<string>>(new Set());
  const [wrongGuessedLetters, setWrongGuessedLetters] = useState<Set<string>>(new Set());
  const [lives, setLivesState] = useState(MAX_LIVES);
  const [score, setScore] = useState(0);
  const [popCells, setPopCells] = useState<Set<number>>(new Set());
  const [wobbleKey, setWobbleKey] = useState<string | null>(null);
  const [depletedLife, setDepletedLife] = useState<number | null>(null);

  // Refs for synchronous access from imperative handle
  const livesRef = useRef(MAX_LIVES);
  const guessedRef = useRef(new Set<string>());
  const wrongRef = useRef(new Set<string>());
  const stateRef = useRef<RoundState>('playing');

  // Wrapped setters that keep refs in sync
  const setLives = useCallback((v: number) => {
    livesRef.current = v;
    setLivesState(v);
    onLivesChange?.(v);
  }, [onLivesChange]);

  const upper = round.answer.toUpperCase();
  const availableWidth = useAvailableWidth();

  // Responsive tile sizing based on longest word and available screen width
  const tileSize = useMemo(() => {
    const words = upper.split(' ');
    const longestWord = Math.max(...words.map((w) => [...w].filter(isLetter).length));
    const maxFit = Math.floor((availableWidth - (longestWord - 1) * TILE_GAP) / longestWord);
    return Math.max(TILE_MIN, Math.min(TILE_MAX, maxFit));
  }, [upper, availableWidth]);

  const tileFontSize = Math.max(10, Math.round(tileSize * 0.45));
  const punctWidth = Math.max(10, Math.round(tileSize * 0.45));
  const wordGap = tileSize >= 36 ? 12 : 8;

  // Build reveal mask — only A-Z letter positions are guessable
  const revealMask = [...upper].map((ch) => {
    if (!isLetter(ch)) return false; // punctuation/spaces are not guessable tiles
    return guessedLetters.has(ch);
  });

  // --- Imperative handle for external control (hints) ---
  useImperativeHandle(ref, () => ({
    deductLife: () => {
      if (stateRef.current !== 'playing') return false;
      if (livesRef.current <= 0) return false;
      const newLives = livesRef.current - 1;
      setLives(newLives);
      setDepletedLife(newLives);
      setTimeout(() => setDepletedLife(null), 400);
      // Don't trigger loss — hints don't kill, only wrong guesses do
      return true;
    },
    addGuessedLetters: (letters: string[]) => {
      if (stateRef.current !== 'playing') return;

      const newGuessed = new Set(guessedRef.current);
      const newWrong = new Set(wrongRef.current);
      const pops = new Set<number>();

      for (const letter of letters) {
        const up = letter.toUpperCase();
        if (newGuessed.has(up) || newWrong.has(up)) continue;

        if (upper.includes(up)) {
          newGuessed.add(up);
          for (let i = 0; i < upper.length; i++) {
            if (upper[i] === up) pops.add(i);
          }
        } else {
          newWrong.add(up);
        }
      }

      guessedRef.current = newGuessed;
      wrongRef.current = newWrong;
      setGuessedLetters(new Set(newGuessed));
      setWrongGuessedLetters(new Set(newWrong));

      if (pops.size > 0) {
        setPopCells(pops);
        setTimeout(() => setPopCells(new Set()), 300);
      }

      // Auto-solve check
      const complete = [...upper].every((ch) => !isLetter(ch) || newGuessed.has(ch));
      if (complete) {
        stateRef.current = 'won';
        setState('won');
        setScore(livesRef.current * POINTS_PER_LIFE);
      }
    },
    getLives: () => livesRef.current,
  }), [upper, setLives]);

  // Round-end transition
  const advancedRef = useRef(false);
  useEffect(() => {
    if (state === 'playing' || !onRoundComplete) return;
    advancedRef.current = false;

    const roundScore = state === 'won' ? score : 0;
    const result: RoundResult = { solved: state === 'won', score: roundScore, lives, answer: round.answer, connection: round.connection };
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

    const clickTimer = setTimeout(() => {
      window.addEventListener('click', handleClick);
    }, 300);

    return () => {
      clearTimeout(timer);
      clearTimeout(clickTimer);
      window.removeEventListener('click', handleClick);
    };
  }, [state, score, round.answer, onRoundComplete]);

  // --- Letter guess logic ---
  const handleLetterGuess = useCallback((key: string) => {
    if (stateRef.current !== 'playing') return;
    if (guessedRef.current.has(key)) return;

    const isInAnswer = upper.includes(key);

    if (isInAnswer) {
      const newGuessed = new Set(guessedRef.current);
      newGuessed.add(key);
      guessedRef.current = newGuessed;
      setGuessedLetters(newGuessed);

      const newPops = new Set<number>();
      for (let i = 0; i < upper.length; i++) {
        if (upper[i] === key) newPops.add(i);
      }
      setPopCells(newPops);
      setTimeout(() => setPopCells(new Set()), 300);

      // Auto-solve: only check A-Z letter positions
      const complete = [...upper].every((ch) => !isLetter(ch) || newGuessed.has(ch));
      if (complete) {
        stateRef.current = 'won';
        setState('won');
        setScore(livesRef.current * POINTS_PER_LIFE);
      }
    } else {
      if (wrongRef.current.has(key)) return;

      const newWrong = new Set(wrongRef.current);
      newWrong.add(key);
      wrongRef.current = newWrong;
      setWrongGuessedLetters(newWrong);
      setWobbleKey(key);
      setTimeout(() => setWobbleKey(null), 200);

      const newLives = livesRef.current - 1;
      setLives(newLives);
      setDepletedLife(newLives);
      setTimeout(() => setDepletedLife(null), 400);

      if (newLives <= 0) {
        stateRef.current = 'lost';
        setState('lost');
        setScore(0);
      }
    }
  }, [upper, setLives]);

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

  const displayScore = state === 'won' ? score.toLocaleString() : '0';

  // --- Determine tile color for each letter position ---
  function tileClass(_ch: string, i: number): string {
    if (state === 'won') {
      return 'border-player bg-player text-white';
    }
    if (state === 'lost') {
      if (!revealMask[i]) return 'border-gray-300 bg-gray-100';
      return 'border-player bg-player text-white';
    }
    if (!revealMask[i]) return 'border-gray-300 bg-white';
    return 'border-player bg-player text-white';
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
    return `${base} bg-gray-100 border-gray-200 text-gray-800 hover:bg-gray-200 active:bg-gray-300`;
  }

  return (
    <div className={`flex flex-col items-center ${compact ? 'pt-2 pb-4' : 'pt-6 pb-16'} min-h-[calc(100vh-52px)] relative`}>
      {/* Running score */}
      {runningScore > 0 && (
        <div className="absolute top-2 right-0 text-sm text-gray-300 tabular-nums font-sans">
          {runningScore.toLocaleString()}
        </div>
      )}

      {/* Round label */}
      <div className={`text-xs font-medium text-gray-400 uppercase tracking-widest ${compact ? 'mb-1' : 'mb-2'}`}>
        {label ?? `Round ${round.round}`}
      </div>

      {/* Clue */}
      {!hideClue && (
        <h2 className="font-serif text-xl text-center text-gray-700 italic mb-3 max-w-md leading-relaxed min-h-[2.5rem] px-4">
          {round.clue}
        </h2>
      )}

      {/* Optional header content (e.g., revealed answers for final round) */}
      {headerContent}

      {/* Letter board */}
      <div className={`${compact ? 'mb-3' : 'mb-6'} self-stretch`} style={{ maxWidth: 'calc(100vw - 2rem)' }}>
        <div className="flex flex-wrap justify-center" style={{ gap: `5px ${wordGap}px` }}>
          {upper.split(' ').reduce<{ elements: React.ReactNode[]; globalIdx: number }>(
            (acc, word, wi) => {
              const startIdx = acc.globalIdx;
              const wordElements = [...word].map((ch, li) => {
                const idx = startIdx + li;

                // Non-letter character: show as plain text
                if (!isLetter(ch)) {
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-center font-bold font-sans text-gray-500 select-none"
                      style={{ width: punctWidth, height: tileSize, fontSize: tileFontSize }}
                    >
                      {ch}
                    </div>
                  );
                }

                // Letter tile
                const isVisible = state === 'won' ? true : revealMask[idx];
                const isPop = popCells.has(idx);
                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-center font-bold font-sans border-2 select-none transition-colors duration-150 shrink-0
                      ${isPop ? 'animate-pop' : ''}
                      ${tileClass(ch, idx)}
                    `}
                    style={{ width: tileSize, height: tileSize, fontSize: tileFontSize }}
                  >
                    {isVisible ? ch : ''}
                  </div>
                );
              });

              acc.elements.push(
                <div key={`word-${wi}`} className="flex" style={{ flexWrap: 'nowrap', gap: TILE_GAP, maxWidth: '100%' }}>
                  {wordElements}
                </div>
              );
              acc.globalIdx += word.length + 1;
              return acc;
            },
            { elements: [], globalIdx: 0 }
          ).elements}
        </div>
      </div>

      {/* Lives display */}
      {state === 'playing' && (
        <div className={`flex gap-2 ${compact ? 'mb-3' : 'mb-6'}`}>
          {Array.from({ length: MAX_LIVES }, (_, i) => {
            const isFilled = i < lives;
            const justDepleted = depletedLife !== null && i === depletedLife;
            return (
              <div
                key={i}
                className={`w-[13px] h-[13px] rounded-full transition-all duration-300 ${
                  isFilled
                    ? 'bg-[#1a1a1b] scale-100'
                    : 'border-2 border-gray-300 scale-90'
                } ${justDepleted ? 'animate-wobble' : ''}`}
              />
            );
          })}
        </div>
      )}

      {/* On-screen keyboard */}
      {state === 'playing' && (
        <div className="w-full max-w-md px-1 select-none">
          {KB_ROWS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-[6px] mb-[6px]">
              {row.map((letter) => {
                const isGuessed = guessedLetters.has(letter);
                const isWrong = wrongGuessedLetters.has(letter);
                const isWobbling = wobbleKey === letter;

                return (
                  <button
                    key={letter}
                    onClick={() => handleLetterGuess(letter)}
                    disabled={isGuessed || isWrong}
                    className={`min-w-0 flex-1 max-w-9 h-11 ${keyClasses(letter)} ${isWobbling ? 'animate-wobble' : ''}`}
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
              <div className="flex gap-2 justify-center mb-3">
                {Array.from({ length: MAX_LIVES }, (_, i) => (
                  <div
                    key={i}
                    className={`w-[13px] h-[13px] rounded-full ${i < lives ? 'bg-[#1a1a1b]' : 'border-2 border-gray-300'}`}
                  />
                ))}
              </div>
              <p className="text-3xl font-bold text-player mb-1">
                {displayScore}
              </p>
              <p className="text-sm text-gray-400">points</p>
            </>
          ) : (
            <>
              <div className="flex gap-2 justify-center mb-3">
                {Array.from({ length: MAX_LIVES }, (_, i) => (
                  <div
                    key={i}
                    className="w-[13px] h-[13px] rounded-full border-2 border-gray-300"
                  />
                ))}
              </div>
              <p className="text-2xl font-bold text-gray-800 mb-1">0</p>
              <p className="text-sm text-gray-400">points</p>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default GameRound;
