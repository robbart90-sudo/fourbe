/**
 * Letter reveal algorithm for Fourbe.
 *
 * Pre-computes a fixed queue of 4 letters (rarest first by English frequency).
 * Reveals fire at 24s, 18s, 12s, 6s — one letter per chunk.
 * Never-complete rule: a reveal is suppressed if it would fill every remaining position.
 */

// English letters sorted rarest first
const FREQ_ORDER = 'ZQJXKVBYWGFPMCHDUOIANLSTRE';

function isLetter(ch: string): boolean {
  return ch >= 'A' && ch <= 'Z';
}

export function getRevealQueue(answer: string): string[] {
  const upper = answer.toUpperCase();
  const uniqueLetters = new Set<string>();
  for (const ch of upper) {
    if (isLetter(ch)) uniqueLetters.add(ch);
  }

  // Sort by rarity (lower index in FREQ_ORDER = rarer)
  const sorted = [...uniqueLetters].sort(
    (a, b) => FREQ_ORDER.indexOf(a) - FREQ_ORDER.indexOf(b),
  );

  // Take first 4
  return sorted.slice(0, 4);
}

export function getRevealedAtChunk(
  answer: string,
  chunk: number,
  playerGuessed?: Set<string>,
): boolean[] {
  const upper = answer.toUpperCase();
  const queue = getRevealQueue(answer);

  if (chunk <= 0) return new Array(upper.length).fill(false);

  // Collect letters that would be auto-revealed up to this chunk
  const autoRevealed = new Set<string>();
  const guessed = playerGuessed || new Set<string>();

  for (let i = 0; i < Math.min(chunk, queue.length); i++) {
    const letter = queue[i];

    // Never-complete: would adding this letter fill every position?
    const testSet = new Set([...autoRevealed, ...guessed, letter]);
    const allFilled = [...upper].every((ch) => !isLetter(ch) || testSet.has(ch));

    if (allFilled) {
      // Suppress this reveal
      continue;
    }

    autoRevealed.add(letter);
  }

  // Build the mask
  return [...upper].map((ch) => isLetter(ch) && autoRevealed.has(ch));
}
