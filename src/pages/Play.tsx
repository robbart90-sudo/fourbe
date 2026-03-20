import { useState, useEffect, useMemo } from 'react';
import GameSession from '../components/GameSession';
import { samplePuzzle } from '../data/sample-puzzle';
import { hardcodedPuzzles, getHardcodedPuzzle } from '../data/puzzles';
import { loadPuzzle, listSavedPuzzles, todayString } from '../lib/puzzle-storage';
import type { Puzzle } from '../types';


export default function Play() {
  // Merge hardcoded + localStorage dates, deduplicated, sorted ascending
  const allDates = useMemo(() => {
    const savedEntries = listSavedPuzzles();
    const dateSet = new Set<string>();
    for (const e of hardcodedPuzzles) dateSet.add(e.date);
    for (const e of savedEntries) dateSet.add(e.date);
    return [...dateSet].sort((a, b) => a.localeCompare(b));
  }, []);

  const defaultDate = useMemo(() => {
    const today = todayString();
    if (allDates.includes(today)) return today;
    if (allDates.length > 0) return allDates[allDates.length - 1];
    return today;
  }, [allDates]);

  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [gameKey, setGameKey] = useState(0);

  useEffect(() => {
    // localStorage takes priority (editor overrides), then hardcoded, then sample
    const saved = loadPuzzle(selectedDate);
    const hardcoded = getHardcodedPuzzle(selectedDate);
    setPuzzle(saved ?? hardcoded ?? samplePuzzle);
    setGameKey((k) => k + 1);
  }, [selectedDate]);

  const activePuzzle = puzzle ?? samplePuzzle;

  const nextPuzzleDate = useMemo(() => {
    const idx = allDates.indexOf(selectedDate);
    if (idx >= 0 && idx < allDates.length - 1) return allDates[idx + 1];
    return null;
  }, [allDates, selectedDate]);

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
        allDates.length > 0 ? (
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="mt-4 text-xs text-gray-400 bg-transparent border-none outline-none cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
          >
            {allDates.map((date, i) => (
              <option key={date} value={date}>
                Playtest Puzzle #{i + 1}
              </option>
            ))}
          </select>
        ) : undefined
      }
    />
  );
}
