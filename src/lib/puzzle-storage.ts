import type { Puzzle } from '../types';

const KEY_PREFIX = 'puzzle-';

export function puzzleKey(date: string): string {
  return `${KEY_PREFIX}${date}`;
}

export function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function savePuzzle(date: string, puzzle: Puzzle): void {
  localStorage.setItem(puzzleKey(date), JSON.stringify(puzzle));
}

export function loadPuzzle(date: string): Puzzle | null {
  const raw = localStorage.getItem(puzzleKey(date));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Puzzle;
  } catch {
    return null;
  }
}

export function deletePuzzle(date: string): void {
  localStorage.removeItem(puzzleKey(date));
}

export interface SavedPuzzleEntry {
  date: string;
  puzzle: Puzzle;
}

export function listSavedPuzzles(): SavedPuzzleEntry[] {
  const entries: SavedPuzzleEntry[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(KEY_PREFIX)) continue;
    const date = key.slice(KEY_PREFIX.length);
    const puzzle = loadPuzzle(date);
    if (puzzle) entries.push({ date, puzzle });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

export function exportAllPuzzles(): SavedPuzzleEntry[] {
  return listSavedPuzzles();
}

export function importPuzzles(entries: SavedPuzzleEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.date && entry.puzzle) {
      savePuzzle(entry.date, entry.puzzle);
      count++;
    }
  }
  return count;
}
