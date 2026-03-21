import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { Puzzle, Round } from '../types';
import { getRevealedAtChunk } from '../lib/reveal';
import { generateAcceptList } from '../lib/judge';
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

const PROMPT_OPTIONS = ['Who am I?', 'What am I?', 'Where am I?'] as const;

function emptyRound(n: number): Round {
  return { clue: '', answer: '', connection: '', round: n };
}

function emptyPuzzle(): Puzzle {
  return {
    subject: '',
    subjectArticle: 'Who am I?',
    rounds: [emptyRound(1), emptyRound(2), emptyRound(3), emptyRound(4)],
    acceptList: { perfect: [], kindOf: [] },
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
  const [newPerfect, setNewPerfect] = useState('');
  const [newKindOf, setNewKindOf] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const refreshList = useCallback(() => {
    setSavedList(listSavedPuzzles());
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  // --- Field updaters ---
  const setSubject = (v: string) => setPuzzle((p) => ({ ...p, subject: v }));
  const setPrompt = (v: string) => setPuzzle((p) => ({ ...p, subjectArticle: v }));

  const setRoundField = (idx: number, field: keyof Round, value: string) => {
    setPuzzle((p) => {
      const rounds = [...p.rounds] as [Round, Round, Round, Round];
      rounds[idx] = { ...rounds[idx], [field]: field === 'answer' ? value.toUpperCase() : value };
      return { ...p, rounds };
    });
  };

  const addAcceptEntry = (tier: 'perfect' | 'kindOf', value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setPuzzle((p) => {
      const list = p.acceptList ?? { perfect: [], kindOf: [] };
      if (list[tier].some((e) => e.toUpperCase() === trimmed.toUpperCase())) return p;
      return { ...p, acceptList: { ...list, [tier]: [...list[tier], trimmed] } };
    });
  };

  const removeAcceptEntry = (tier: 'perfect' | 'kindOf', idx: number) => {
    setPuzzle((p) => {
      const list = p.acceptList ?? { perfect: [], kindOf: [] };
      return { ...p, acceptList: { ...list, [tier]: list[tier].filter((_, i) => i !== idx) } };
    });
  };

  const handleGenerateAI = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const answers = puzzle.rounds.map((r) => r.answer).filter(Boolean);
      const result = await generateAcceptList(puzzle.subject, answers);
      // Merge with existing (don't overwrite manual additions)
      setPuzzle((p) => {
        const existing = p.acceptList ?? { perfect: [], kindOf: [] };
        const existingPerfectUpper = new Set(existing.perfect.map((s) => s.toUpperCase()));
        const existingKindOfUpper = new Set(existing.kindOf.map((s) => s.toUpperCase()));
        const newPerfect = result.perfect.filter((s) => !existingPerfectUpper.has(s.toUpperCase()));
        const newKindOf = result.kindOf.filter((s) => !existingKindOfUpper.has(s.toUpperCase()));
        return {
          ...p,
          acceptList: {
            perfect: [...existing.perfect, ...newPerfect],
            kindOf: [...existing.kindOf, ...newKindOf],
          },
        };
      });
    } catch (err) {
      console.error('Accept list generation failed:', err);
      const msg = err instanceof Error ? err.message : 'Failed — try again';
      setAiError(msg);
      setTimeout(() => setAiError(''), 5000);
    } finally {
      setAiLoading(false);
    }
  };

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
            Prompt
          </label>
          <div className="flex gap-2">
            {PROMPT_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setPrompt(opt)}
                className={`px-3 py-1.5 text-sm rounded-lg cursor-pointer transition-colors ${
                  puzzle.subjectArticle === opt
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
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

      {/* ACCEPT LIST */}
      <section className="mb-8 border border-gray-200 rounded-lg p-5">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Fourbe Answer — Accept List
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Perfect answers */}
          <div>
            <label className="block text-xs font-medium text-player uppercase tracking-wider mb-2">
              Perfect! Answers
            </label>
            {/* Auto-included subject */}
            {puzzle.subject.trim() && (
              <div className="flex items-center gap-2 mb-1 px-2 py-1.5 bg-gray-50 rounded text-sm text-gray-400 italic">
                {puzzle.subject}
                <span className="text-xs text-gray-300 ml-auto">auto</span>
              </div>
            )}
            {/* Manual entries */}
            <div className="space-y-1 mb-2">
              {(puzzle.acceptList?.perfect || []).map((entry, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-green-50 rounded text-sm text-gray-800">
                  <span className="flex-1">{entry}</span>
                  <button
                    type="button"
                    onClick={() => removeAcceptEntry('perfect', i)}
                    className="text-gray-400 hover:text-red-500 cursor-pointer text-xs font-bold"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newPerfect}
                onChange={(e) => setNewPerfect(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAcceptEntry('perfect', newPerfect);
                    setNewPerfect('');
                  }
                }}
                placeholder="Add entry..."
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded outline-none focus:border-gray-800 transition-colors"
              />
              <button
                type="button"
                onClick={() => { addAcceptEntry('perfect', newPerfect); setNewPerfect(''); }}
                className="px-2.5 py-1.5 text-xs font-medium bg-gray-100 rounded cursor-pointer hover:bg-gray-200 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Kind Of answers */}
          <div>
            <label className="block text-xs font-medium text-kindof uppercase tracking-wider mb-2">
              Kind Of! Answers
            </label>
            <div className="space-y-1 mb-2">
              {(puzzle.acceptList?.kindOf || []).map((entry, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-amber-50 rounded text-sm text-gray-800">
                  <span className="flex-1">{entry}</span>
                  <button
                    type="button"
                    onClick={() => removeAcceptEntry('kindOf', i)}
                    className="text-gray-400 hover:text-red-500 cursor-pointer text-xs font-bold"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newKindOf}
                onChange={(e) => setNewKindOf(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAcceptEntry('kindOf', newKindOf);
                    setNewKindOf('');
                  }
                }}
                placeholder="Add entry..."
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded outline-none focus:border-gray-800 transition-colors"
              />
              <button
                type="button"
                onClick={() => { addAcceptEntry('kindOf', newKindOf); setNewKindOf(''); }}
                className="px-2.5 py-1.5 text-xs font-medium bg-gray-100 rounded cursor-pointer hover:bg-gray-200 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Generate with AI button */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={handleGenerateAI}
            disabled={!puzzle.subject.trim() || puzzle.rounds.filter((r) => r.answer.trim()).length < 2 || aiLoading}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {aiLoading && (
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {aiError || (aiLoading ? 'Generating...' : 'Generate with AI')}
          </button>
        </div>
      </section>

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
