import { useState } from 'react';
import { samplePuzzle } from './data/sample-puzzle';
import { getRevealedAtChunk, getRevealQueue } from './lib/reveal';

const REVEAL_LABELS: Record<number, string> = {
  0: 'None (30–24s)',
  1: 'Reveal 1 — queue[0] (24s)',
  2: 'Reveal 2 — queue[1] (18s)',
  3: 'Reveal 3 — queue[2] (12s)',
  4: 'Reveal 4 — queue[3] (6s)',
};

function AnswerDisplay({ answer, level }: { answer: string; level: number }) {
  const revealed = getRevealedAtChunk(answer, level);
  const upper = answer.toUpperCase();

  return (
    <div className="flex flex-wrap gap-[3px]">
      {[...upper].map((ch, i) => {
        if (ch === ' ') return <div key={i} className="w-2.5" />;
        const isRevealed = revealed[i];
        return (
          <div
            key={i}
            className={`w-9 h-9 flex items-center justify-center text-sm font-bold font-sans border-2 rounded-sm ${
              isRevealed
                ? 'border-auto bg-white text-auto-text'
                : 'border-gray-300 bg-white'
            }`}
          >
            {isRevealed ? ch : ''}
          </div>
        );
      })}
    </div>
  );
}

function RevealStats({ answer, level }: { answer: string; level: number }) {
  const revealed = getRevealedAtChunk(answer, level);
  const upper = answer.toUpperCase();
  const letterCount = [...upper].filter((c) => c !== ' ').length;
  const revealedCount = revealed.filter(Boolean).length;
  const pct = letterCount > 0 ? Math.round((revealedCount / letterCount) * 100) : 0;

  return (
    <span className="text-xs text-gray-400 tabular-nums">
      {revealedCount}/{letterCount} ({pct}%)
    </span>
  );
}

function QueueDisplay({ answer }: { answer: string }) {
  const queue = getRevealQueue(answer);
  const upper = answer.toUpperCase();

  return (
    <div className="flex items-center gap-1.5 mb-3">
      <span className="text-xs text-gray-400 mr-1">Queue:</span>
      {queue.map((letter, i) => {
        const count = [...upper].filter((ch) => ch === letter).length;
        return (
          <span key={i} className="text-xs font-mono font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
            {letter}
            <span className="text-blue-400 font-normal ml-0.5">&times;{count}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function App() {
  const [level, setLevel] = useState(0);

  return (
    <div className="py-8">
      <h1 className="font-serif text-2xl font-bold mb-1">Fourbe — Reveal Test</h1>
      <p className="text-gray-500 text-sm mb-6">
        Subject: <span className="text-black font-semibold">{samplePuzzle.subject}</span>
      </p>

      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-gray-400 uppercase tracking-wider mr-1">Reveal</span>
        {[0, 1, 2, 3, 4].map((c) => (
          <button
            key={c}
            onClick={() => setLevel(c)}
            className={`px-3 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors ${
              level === c
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {c === 0 ? 'None' : c}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 mb-8">{REVEAL_LABELS[level]}</p>

      <div className="space-y-6">
        {samplePuzzle.rounds.map((round) => (
          <div key={round.round} className="border border-gray-200 rounded-lg p-5">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Round {round.round}
              </h2>
              <RevealStats answer={round.answer} level={level} />
            </div>
            <p className="text-gray-600 text-sm mb-3 font-serif italic">"{round.clue}"</p>
            <QueueDisplay answer={round.answer} />
            <AnswerDisplay answer={round.answer} level={level} />
          </div>
        ))}
      </div>

      <div className="mt-6 text-xs text-gray-400 space-y-0.5">
        <p>4 letters per answer, rarest first (Z,Q,J,X,K,V,B,Y,W,G,F,P,M,C,H,D,U,O,I,A,N,L,S,T,R,E). Reveals at 24s, 18s, 12s, 6s. Never-complete rule suppresses a reveal if it would fill all positions.</p>
      </div>
    </div>
  );
}
