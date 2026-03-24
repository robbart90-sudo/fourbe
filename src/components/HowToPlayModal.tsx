import { useEffect, useRef } from 'react';

const EXAMPLES = [
  { clue: 'Legal foundation for a lawsuit', answer: 'GROUNDS' },
  { clue: "The world's most populous island", answer: 'JAVA' },
  { clue: 'Instagram tool for smoothing images', answer: 'FILTERS' },
  { clue: 'British weekend feast', answer: 'SUNDAY ROAST' },
];

function isLetter(ch: string): boolean {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
}

function AnswerTiles({ answer }: { answer: string }) {
  return (
    <div className="flex gap-[3px] justify-end">
      {[...answer].map((ch, i) =>
        ch === ' ' ? (
          <div key={i} className="w-1.5" />
        ) : isLetter(ch) ? (
          <div
            key={i}
            className="w-8 h-8 flex items-center justify-center text-sm font-bold font-sans border-2 border-player bg-player text-white select-none"
          >
            {ch}
          </div>
        ) : (
          <div
            key={i}
            className="w-4 h-8 flex items-center justify-center text-sm font-bold font-sans text-gray-500 select-none"
          >
            {ch}
          </div>
        )
      )}
    </div>
  );
}

export default function HowToPlayModal({ onClose }: { onClose: () => void }) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="shadow-xl w-full mx-4 max-h-[90vh] overflow-y-auto relative" style={{ maxWidth: 500, background: '#F8F5F0' }}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center cursor-pointer transition-colors text-2xl leading-none"
          style={{ color: '#9a8e80' }}
        >
          &times;
        </button>

        <div style={{ padding: '48px 32px 32px' }}>
          {/* Header */}
          <h2
            className="mb-2"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, color: '#1a1a1b' }}
          >
            How To Play Fourbe
          </h2>

          {/* Bullets */}
          <ul className="space-y-4 mb-10 mt-6 font-sans font-medium" style={{ fontSize: 16, lineHeight: 1.65, color: '#1a1a1b' }}>
            <li className="flex items-baseline gap-3">
              <span className="shrink-0" style={{ fontSize: 8, position: 'relative', top: -2 }}>&bull;</span>
              <span>Guess letters to solve a clue each round.</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="shrink-0" style={{ fontSize: 8, position: 'relative', top: -2 }}>&bull;</span>
              <span>All four clues partially describe one hidden subject.</span>
            </li>
          </ul>

          {/* Example section */}
          <p className="font-bold uppercase tracking-wider mb-5" style={{ fontSize: 13, color: '#6b5e50' }}>
            Example
          </p>

          <div className="space-y-5 mb-5">
            {EXAMPLES.map(({ clue, answer }) => (
              <div key={answer} className="space-y-1.5">
                <p className="italic" style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: '#6b5e50' }}>
                  {clue}
                </p>
                <AnswerTiles answer={answer} />
              </div>
            ))}
          </div>

          {/* Fourbe reveal */}
          <div className="text-center pt-4 pb-5">
            <p className="font-sans" style={{ fontSize: 22 }}>
              <span style={{ color: '#6b5e50' }}>The Fourbe is</span>{' '}
              <span className="font-bold" style={{ color: '#1a1a1b' }}>Coffee</span>
            </p>
          </div>

          {/* Closing tagline */}
          <p className="text-center italic" style={{ fontSize: 14, color: '#9a8e80', fontFamily: 'var(--font-serif)' }}>
            Solve more clues. See more answers. Guess the Fourbe.
          </p>
        </div>
      </div>
    </div>
  );
}
