import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import type { Round, RoundResult } from '../types';

const MAX_LIVES = 4;
const POINTS_PER_LIFE = 250;
const BACKSTOP_DURATION = 300; // 5 minutes in seconds
const TILE_MAX = 44;
const TILE_MIN = 28;
const TILE_GAP = 5;

function isLetter(ch: string): boolean {
  return ch >= 'A' && ch <= 'Z';
}

type RoundState = 'playing' | 'won' | 'lost';

const KB_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M'],
];

function useContainerWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(() => {
    // SSR-safe initial estimate: viewport minus #root padding, with safety margin
    if (typeof window === 'undefined') return 400;
    return Math.min(window.innerWidth - 40, 560); // conservative: extra 8px safety margin
  });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const measure = () => setWidth(ref.current?.clientWidth ?? 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

interface GameRoundProps {
  round: Round;
  runningScore?: number;
  onRoundComplete?: (result: RoundResult) => void;
}

export default function GameRound({ round, runningScore = 0, onRoundComplete }: GameRoundProps) {
  const [state, setState] = useState<RoundState>('playing');
  const [guessedLetters, setGuessedLetters] = useState<Set<string>>(new Set());
  const [wrongGuessedLetters, setWrongGuessedLetters] = useState<Set<string>>(new Set());
  const [lives, setLives] = useState(MAX_LIVES);
  const [score, setScore] = useState(0);
  const [popCells, setPopCells] = useState<Set<number>>(new Set());
  const [wobbleKey, setWobbleKey] = useState<string | null>(null);
  const [depletedLife, setDepletedLife] = useState<number | null>(null);

  const upper = round.answer.toUpperCase();
  const boardRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(boardRef);

  // Responsive tile sizing based on longest word and measured container width
  const tileSize = useMemo(() => {
    const words = upper.split(' ');
    const longestWord = Math.max(...words.map((w) => [...w].filter(isLetter).length));
    const maxFit = Math.floor((containerWidth - (longestWord - 1) * TILE_GAP) / longestWord);
    return Math.max(TILE_MIN, Math.min(TILE_MAX, maxFit));
  }, [upper, containerWidth]);

  const tileFontSize = Math.max(10, Math.round(tileSize * 0.45));
  const punctWidth = Math.max(10, Math.round(tileSize * 0.45));
  const wordGap = tileSize >= 36 ? 12 : 8;

  // Build reveal mask — only A-Z letter positions are guessable
  const revealMask = [...upper].map((ch) => {
    if (!isLetter(ch)) return false; // punctuation/spaces are not guessable tiles
    return guessedLetters.has(ch);
  });

  // --- Invisible backstop timer ---
  useEffect(() => {
    if (state !== 'playing') return;
    const timer = setTimeout(() => {
      setState('lost');
      setScore(0);
    }, BACKSTOP_DURATION * 1000);
    return () => clearTimeout(timer);
  }, [state]);

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
    if (state !== 'playing') return;
    if (guessedLetters.has(key)) return;

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

      // Auto-solve: only check A-Z letter positions
      const complete = [...upper].every((ch) => !isLetter(ch) || newGuessed.has(ch));
      if (complete) {
        setState('won');
        setScore(lives * POINTS_PER_LIFE);
      }
    } else {
      if (wrongGuessedLetters.has(key)) return;

      const newWrong = new Set(wrongGuessedLetters);
      newWrong.add(key);
      setWrongGuessedLetters(newWrong);
      setWobbleKey(key);
      setTimeout(() => setWobbleKey(null), 200);

      const newLives = lives - 1;
      setLives(newLives);
      setDepletedLife(newLives);
      setTimeout(() => setDepletedLife(null), 400);

      if (newLives <= 0) {
        setState('lost');
        setScore(0);
      }
    }
  }, [state, guessedLetters, upper, wrongGuessedLetters, lives]);

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
    <div className="flex flex-col items-center pt-6 pb-16 min-h-[calc(100vh-52px)] relative">
      {/* Running score */}
      {runningScore > 0 && (
        <div className="absolute top-2 right-0 text-sm text-gray-300 tabular-nums font-sans">
          {runningScore.toLocaleString()}
        </div>
      )}

      {/* Round label */}
      <div className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">
        Round {round.round}
      </div>

      {/* Clue */}
      <h2 className="font-serif text-xl text-center text-gray-700 italic mb-3 max-w-md leading-relaxed min-h-[2.5rem] px-4">
        {round.clue}
      </h2>

      {/* Letter board */}
      <div ref={boardRef} className="mb-6 self-stretch">
        <div className="flex flex-wrap justify-center" style={{ gap: `5px ${wordGap}px` }}>
          {upper.split(' ').reduce<{ elements: React.ReactNode[]; globalIdx: number }>(
            (acc, word, wi, arr) => {
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
                    className={`flex items-center justify-center font-bold font-sans border-2 select-none transition-colors duration-150
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
                <div key={`word-${wi}`} className="flex" style={{ flexWrap: 'nowrap', gap: TILE_GAP }}>
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
        <div className="flex gap-2 mb-6">
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
}
