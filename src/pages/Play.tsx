import { useState, useEffect, useMemo } from 'react';
import GameSession from '../components/GameSession';
import { samplePuzzle } from '../data/sample-puzzle';
import { loadPuzzle, listSavedPuzzles, todayString } from '../lib/puzzle-storage';
import type { Puzzle } from '../types';

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function Play() {
  const savedEntries = useMemo(() => listSavedPuzzles(), []);

  const defaultDate = useMemo(() => {
    const today = todayString();
    if (savedEntries.some((e) => e.date === today)) return today;
    if (savedEntries.length > 0) return savedEntries[savedEntries.length - 1].date;
    return today;
  }, [savedEntries]);

  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [gameKey, setGameKey] = useState(0);

  useEffect(() => {
    const saved = loadPuzzle(selectedDate);
    setPuzzle(saved ?? (savedEntries.length === 0 ? samplePuzzle : null));
    setGameKey((k) => k + 1);
  }, [selectedDate, savedEntries.length]);

  const activePuzzle = puzzle ?? samplePuzzle;

  const nextPuzzleDate = useMemo(() => {
    const idx = savedEntries.findIndex((e) => e.date === selectedDate);
    if (idx >= 0 && idx < savedEntries.length - 1) return savedEntries[idx + 1].date;
    return null;
  }, [savedEntries, selectedDate]);

  const handleNextPuzzle = () => {
    if (nextPuzzleDate) setSelectedDate(nextPuzzleDate);
  };

  return (
    <GameSession
      key={gameKey}
      puzzle={activePuzzle}
      nextPuzzleDate={nextPuzzleDate}
      onNextPuzzle={handleNextPuzzle}
      dateSelector={
        savedEntries.length > 0 ? (
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="mt-4 text-xs text-gray-400 bg-transparent border-none outline-none cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
          >
            {savedEntries.map((entry) => (
              <option key={entry.date} value={entry.date}>
                {formatDateLabel(entry.date)}
              </option>
            ))}
          </select>
        ) : undefined
      }
    />
  );
}
