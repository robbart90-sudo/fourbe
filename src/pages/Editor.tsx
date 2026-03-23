import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { Puzzle, Round } from '../types';
import { getRevealedAtChunk } from '../lib/reveal';
import {
  savePuzzle,
  deletePuzzle,
  listSavedPuzzles,
  exportAllPuzzles,
  importPuzzles,
  todayString,
  type SavedPuzzleEntry,
} from '../lib/puzzle-storage';

const EDITOR_KEY = 'fourbe2026';

function emptyRound(n: number): Round {
  return { clue: '', answer: '', connection: '', connectionCharIndices: [], round: n };
}

function emptyPuzzle(): Puzzle {
  return {
    subject: '',
    rounds: [emptyRound(1), emptyRound(2), emptyRound(3), emptyRound(4)],
  };
}

// --- Reveal preview for a single answer ---
function RevealPreview({ answer }: { answer: string }) {
  const [level, setLevel] = useState(0);

  if (!answer.trim()) {
    return <p className="text-xs text-gray-400 italic mt-2">Type an answer to preview reveals</p>;
  }

  const upper = answer.toUpperCase();
  const revealed = getRevealedAtChunk(upper, level);
  const isLetter = (c: string) => c >= 'A' && c <= 'Z';
  const letterCount = [...upper].filter(isLetter).length;
  const revealedCount = revealed.filter(Boolean).length;
  const pct = letterCount > 0 ? Math.round((revealedCount / letterCount) * 100) : 0;

  const words = upper.split(' ');
  let globalIdx = 0;

  return (
    <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
      {/* Stage buttons */}
      <div className="flex items-center gap-1.5 mb-3">
        {['None', 'R1', 'R2', 'R3', 'R4'].map((label, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setLevel(i)}
            className={`px-2.5 py-1 text-xs font-medium rounded cursor-pointer transition-colors ${
              level === i
                ? 'bg-gray-800 text-white'
                : 'bg-white text-gray-500 border border-gray-300 hover:bg-gray-100'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-2 tabular-nums">
          {revealedCount}/{letterCount} ({pct}%)
        </span>
      </div>

      {/* Tiles */}
      <div className="flex flex-wrap gap-[3px]" style={{ rowGap: '4px' }}>
        {words.map((word, wi) => {
          const startIdx = globalIdx;
          const tiles = [...word].map((ch, li) => {
            const idx = startIdx + li;
            if (!isLetter(ch)) {
              return (
                <div
                  key={idx}
                  className="w-4 h-8 flex items-center justify-center text-xs font-bold font-sans text-gray-500"
                >
                  {ch}
                </div>
              );
            }
            const isRevealed = revealed[idx];
            return (
              <div
                key={idx}
                className={`w-8 h-8 flex items-center justify-center text-xs font-bold font-sans border-2 rounded-sm ${
                  isRevealed
                    ? 'border-auto bg-white text-auto-text'
                    : 'border-gray-300 bg-white'
                }`}
              >
                {isRevealed ? ch : ''}
              </div>
            );
          });
          globalIdx += word.length + 1; // +1 for space

          return (
            <div key={wi} className="flex gap-[3px]" style={{ flexWrap: 'nowrap' }}>
              {tiles}
              {wi < words.length - 1 && <div className="w-1.5" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Editor() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Access control
  useEffect(() => {
    if (searchParams.get('key') !== EDITOR_KEY) {
      navigate('/play', { replace: true });
    }
  }, [searchParams, navigate]);

  if (searchParams.get('key') !== EDITOR_KEY) return null;

  return <EditorInner />;
}

function EditorInner() {
  const [date, setDate] = useState(todayString());
  const [puzzle, setPuzzle] = useState<Puzzle>(emptyPuzzle());
  const [savedList, setSavedList] = useState<SavedPuzzleEntry[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveMsg, setSaveMsg] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const refreshList = useCallback(() => {
    setSavedList(listSavedPuzzles());
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  // --- Field updaters ---
  const setSubject = (v: string) => setPuzzle((p) => ({ ...p, subject: v }));
  const setCategory = (v: string) => setPuzzle((p) => ({ ...p, subjectCategory: v }));

  const setRoundField = (idx: number, field: keyof Round, value: string) => {
    setPuzzle((p) => {
      const rounds = [...p.rounds] as [Round, Round, Round, Round];
      rounds[idx] = { ...rounds[idx], [field]: field === 'answer' ? value.toUpperCase() : value };
      // Reset connection char indices when answer changes
      if (field === 'answer') {
        rounds[idx] = { ...rounds[idx], connectionCharIndices: [] };
      }
      return { ...p, rounds };
    });
  };

  // Character-level connection selection with click-drag
  const draggingRef = useRef<{ roundIdx: number; adding: boolean } | null>(null);

  const toggleConnectionChar = (roundIdx: number, charIdx: number) => {
    setPuzzle((p) => {
      const rounds = [...p.rounds] as [Round, Round, Round, Round];
      const indices = rounds[roundIdx].connectionCharIndices ?? [];
      const next = indices.includes(charIdx)
        ? indices.filter((i) => i !== charIdx)
        : [...indices, charIdx].sort((a, b) => a - b);
      rounds[roundIdx] = { ...rounds[roundIdx], connectionCharIndices: next };
      return { ...p, rounds };
    });
  };

  const handleCharMouseDown = (roundIdx: number, charIdx: number) => {
    const indices = puzzle.rounds[roundIdx].connectionCharIndices ?? [];
    const adding = !indices.includes(charIdx);
    draggingRef.current = { roundIdx, adding };
    toggleConnectionChar(roundIdx, charIdx);
  };

  const handleCharMouseEnter = (roundIdx: number, charIdx: number) => {
    if (!draggingRef.current || draggingRef.current.roundIdx !== roundIdx) return;
    const indices = puzzle.rounds[roundIdx].connectionCharIndices ?? [];
    const isSelected = indices.includes(charIdx);
    if (draggingRef.current.adding && !isSelected) {
      toggleConnectionChar(roundIdx, charIdx);
    } else if (!draggingRef.current.adding && isSelected) {
      toggleConnectionChar(roundIdx, charIdx);
    }
  };

  useEffect(() => {
    const handleMouseUp = () => { draggingRef.current = null; };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // --- Validation ---
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!puzzle.subject.trim()) errs['subject'] = 'Subject is required';
    if (!date) errs['date'] = 'Date is required';
    for (let i = 0; i < 4; i++) {
      const r = puzzle.rounds[i];
      if (!r.clue.trim()) errs[`r${i}-clue`] = 'Required';
      if (!r.answer.trim()) errs[`r${i}-answer`] = 'Required';
      if (!r.connection.trim()) errs[`r${i}-connection`] = 'Required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // --- Save ---
  const handleSave = () => {
    if (!validate()) return;
    savePuzzle(date, puzzle);
    setSaveMsg('Saved!');
    setTimeout(() => setSaveMsg(''), 2000);
    refreshList();
  };

  // --- Load ---
  const handleLoad = (entry: SavedPuzzleEntry) => {
    setDate(entry.date);
    setPuzzle(entry.puzzle);
    setErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- Delete ---
  const handleDelete = (dateStr: string) => {
    if (deleteConfirm === dateStr) {
      deletePuzzle(dateStr);
      setDeleteConfirm(null);
      refreshList();
    } else {
      setDeleteConfirm(dateStr);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  // --- Export ---
  const handleExport = () => {
    const data = exportAllPuzzles();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fourbe-puzzles-${todayString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Import ---
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        const count = importPuzzles(Array.isArray(data) ? data : []);
        refreshList();
        alert(`Imported ${count} puzzle(s).`);
      } catch {
        alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
    if (importRef.current) importRef.current.value = '';
  };

  // --- New puzzle ---
  const handleNew = () => {
    setPuzzle(emptyPuzzle());
    setDate(todayString());
    setErrors({});
  };

  const fieldError = (key: string) =>
    errors[key] ? <span className="text-red-500 text-xs ml-2">{errors[key]}</span> : null;

  return (
    <div className="py-8 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-serif text-2xl font-bold">Puzzle Editor</h1>
        <button
          type="button"
          onClick={handleNew}
          className="text-sm text-gray-500 hover:text-black cursor-pointer transition-colors"
        >
          New Puzzle
        </button>
      </div>

      {/* PUZZLE METADATA */}
      <section className="mb-8 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
            Subject {fieldError('subject')}
          </label>
          <input
            type="text"
            value={puzzle.subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g., Dracula"
            className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-lg outline-none focus:border-gray-800 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
            Category
          </label>
          <input
            type="text"
            value={puzzle.subjectCategory ?? ''}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Person, Place, Thing, Character, Game..."
            list="category-suggestions"
            className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-lg outline-none focus:border-gray-800 transition-colors"
          />
          <datalist id="category-suggestions">
            <option value="Person" />
            <option value="Place" />
            <option value="Thing" />
            <option value="Character" />
            <option value="Game" />
            <option value="Movie" />
            <option value="TV Show" />
            <option value="Quote" />
            <option value="Event" />
          </datalist>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
            Date {fieldError('date')}
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2.5 text-base border border-gray-300 rounded-lg outline-none focus:border-gray-800 transition-colors"
          />
        </div>
      </section>

      {/* ROUND SECTIONS */}
      {puzzle.rounds.map((r, i) => (
        <section key={i} className="mb-8 border border-gray-200 rounded-lg p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Round {i + 1}
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Clue {fieldError(`r${i}-clue`)}
              </label>
              <input
                type="text"
                value={r.clue}
                onChange={(e) => setRoundField(i, 'clue', e.target.value)}
                placeholder="Crossword-style clue..."
                className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-lg outline-none focus:border-gray-800 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Answer {fieldError(`r${i}-answer`)}
                <span className="text-gray-400 ml-2 tabular-nums">
                  {r.answer.replace(/\s/g, '').length} letters
                  {r.answer.includes(' ') && ` (${r.answer.split(/\s+/).filter(Boolean).map((w) => w.length).join(',')})`}
                </span>
              </label>
              <input
                type="text"
                value={r.answer}
                onChange={(e) => setRoundField(i, 'answer', e.target.value)}
                placeholder="ANSWER IN CAPS"
                className="w-full px-3 py-2.5 text-base font-mono border border-gray-300 rounded-lg outline-none focus:border-gray-800 transition-colors uppercase"
              />
              <RevealPreview answer={r.answer} />
              {r.answer.trim() && (() => {
                const upper = r.answer.toUpperCase();
                const selectedSet = new Set(r.connectionCharIndices ?? []);
                const isLetterCh = (c: string) => c >= 'A' && c <= 'Z';
                let globalIdx = 0;
                return (
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                      Connection Letters
                      {selectedSet.size === 0 && (
                        <span className="text-amber-500 ml-2">Tag at least one letter</span>
                      )}
                    </label>
                    <div className="flex flex-wrap gap-[3px] select-none" style={{ rowGap: '4px' }}>
                      {upper.split(' ').map((word, wi) => {
                        const startIdx = globalIdx;
                        const tiles = [...word].map((ch, li) => {
                          const idx = startIdx + li;
                          if (!isLetterCh(ch)) {
                            return (
                              <div
                                key={idx}
                                className="w-6 h-7 flex items-center justify-center text-xs font-bold font-mono text-gray-400"
                              >
                                {ch}
                              </div>
                            );
                          }
                          const selected = selectedSet.has(idx);
                          return (
                            <div
                              key={idx}
                              onMouseDown={() => handleCharMouseDown(i, idx)}
                              onMouseEnter={() => handleCharMouseEnter(i, idx)}
                              className={`w-7 h-7 flex items-center justify-center text-xs font-bold font-mono border-2 rounded-sm cursor-pointer transition-colors ${
                                selected
                                  ? 'bg-amber-500 border-amber-500 text-white'
                                  : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                              }`}
                            >
                              {ch}
                            </div>
                          );
                        });
                        globalIdx += word.length + 1;
                        return (
                          <div key={wi} className="flex gap-[3px]" style={{ flexWrap: 'nowrap' }}>
                            {tiles}
                            {wi < upper.split(' ').length - 1 && <div className="w-1.5" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              {r.answer.replace(/\s/g, '').length > 0 && r.answer.replace(/\s/g, '').length < 5 && (
                <p className="text-amber-600 text-xs mt-1">Answer should be at least 5 letters for the reveal system to work properly.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Connection {fieldError(`r${i}-connection`)}
              </label>
              <input
                type="text"
                value={r.connection}
                onChange={(e) => setRoundField(i, 'connection', e.target.value)}
                placeholder="How this answer relates to the subject..."
                className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-lg outline-none focus:border-gray-800 transition-colors"
              />
            </div>
          </div>
        </section>
      ))}

      {/* SAVE */}
      <div className="flex items-center gap-3 mb-12">
        <button
          type="button"
          onClick={handleSave}
          className="px-6 py-3 text-base font-semibold bg-gray-800 text-white rounded-lg cursor-pointer hover:bg-black transition-colors"
        >
          Save Puzzle
        </button>
        {saveMsg && (
          <span className="text-sm font-medium text-player animate-fade-in">{saveMsg}</span>
        )}
      </div>

      {/* SAVED PUZZLES LIST */}
      <section className="mb-8">
        <h2 className="font-serif text-lg font-bold mb-4">Saved Puzzles</h2>
        {savedList.length === 0 ? (
          <p className="text-sm text-gray-400">No saved puzzles yet.</p>
        ) : (
          <div className="space-y-2">
            {savedList.map((entry) => (
              <div
                key={entry.date}
                className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3"
              >
                <button
                  type="button"
                  onClick={() => handleLoad(entry)}
                  className="flex-1 text-left cursor-pointer hover:opacity-70 transition-opacity"
                >
                  <span className="text-sm font-medium text-gray-800">{entry.date}</span>
                  <span className="text-sm text-gray-500 ml-2">{entry.puzzle.subject}</span>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {entry.puzzle.rounds.map((r) => r.answer || '—').join(' / ')}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(entry.date)}
                  className={`ml-3 text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                    deleteConfirm === entry.date
                      ? 'bg-red-500 text-white'
                      : 'text-gray-400 hover:text-red-500'
                  }`}
                >
                  {deleteConfirm === entry.date ? 'Confirm?' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* EXPORT / IMPORT */}
      <section className="flex gap-3 mb-8">
        <button
          type="button"
          onClick={handleExport}
          disabled={savedList.length === 0}
          className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Export All
        </button>
        <button
          type="button"
          onClick={() => importRef.current?.click()}
          className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
        >
          Import
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
      </section>
    </div>
  );
}
