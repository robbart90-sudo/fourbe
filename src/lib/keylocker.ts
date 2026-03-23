export type Feedback = 'higher' | 'lower' | 'correct' | 'silent';

export interface Range {
  lower: string;
  upper: string;
  solved: boolean;
  letter?: string;
}

export interface GuessResult {
  word: string;
  feedback: Feedback[];
  listenedPos: number;
}

export function getListenFeedback(guess: string, target: string, listenedPos: number): Feedback[] {
  const g = guess.toUpperCase();
  const t = target.toUpperCase();
  return Array.from({ length: 5 }, (_, i) => {
    if (g[i] === t[i]) return 'correct';
    if (i === listenedPos) return g[i] < t[i] ? 'higher' : 'lower';
    return 'silent';
  });
}

export function computeRanges(guesses: GuessResult[]): Range[] {
  const ranges: Range[] = Array.from({ length: 5 }, () => ({
    lower: 'A',
    upper: 'Z',
    solved: false,
  }));

  for (const { word, feedback } of guesses) {
    const w = word.toUpperCase();
    for (let i = 0; i < 5; i++) {
      const letter = w[i];
      const f = feedback[i];

      if (f === 'silent') continue;

      if (f === 'correct') {
        ranges[i].solved = true;
        ranges[i].letter = letter;
        ranges[i].lower = letter;
        ranges[i].upper = letter;
      } else if (f === 'higher') {
        // target is higher than guessed letter — lower bound moves up
        const next = String.fromCharCode(letter.charCodeAt(0) + 1);
        if (next > ranges[i].lower) ranges[i].lower = next;
      } else if (f === 'lower') {
        // target is lower than guessed letter — upper bound moves down
        const prev = String.fromCharCode(letter.charCodeAt(0) - 1);
        if (prev < ranges[i].upper) ranges[i].upper = prev;
      }
    }
  }

  return ranges;
}

export function validateGuess(
  guess: string,
  words: string[],
): { valid: boolean; error?: string } {
  const g = guess.toUpperCase().trim();
  if (g.length !== 5) return { valid: false, error: 'Must be exactly 5 letters' };
  if (!/^[A-Z]{5}$/.test(g)) return { valid: false, error: 'Letters only' };
  if (!words.includes(g)) return { valid: false, error: 'Not in word list' };
  return { valid: true };
}

export function generateShareCard(guesses: GuessResult[], dateStr: string): string {
  const lines: string[] = [`Keylocker \u2014 ${dateStr}`];

  // Track cumulative solved state across guesses
  const solved = [false, false, false, false, false];

  for (let g = 0; g < guesses.length; g++) {
    const guess = guesses[g];
    // Update solved state from this guess's feedback
    for (let i = 0; i < 5; i++) {
      if (guess.feedback[i] === 'correct') solved[i] = true;
    }

    const isWinningGuess = solved.every(Boolean);

    // Listen indicators: ● for listened, ○ for not
    // On the winning guess (all correct), show no listen indicator
    const listenPart = isWinningGuess
      ? '\u25CB \u25CB \u25CB \u25CB \u25CB'
      : [0, 1, 2, 3, 4].map(i => i === guess.listenedPos ? '\u25CF' : '\u25CB').join(' ');

    // Solved state: 🟩 for solved, ⬜ for unsolved
    const solvedPart = solved.map(s => s ? '\uD83D\uDFE9' : '\u2B1C').join('');

    lines.push(`${listenPart}  ${solvedPart}`);
  }

  lines.push(`Cracked in ${guesses.length} \uD83D\uDD13`);
  return lines.join('\n');
}

export function getTodaysWord(answers: string[]): string {
  const now = new Date();
  // Use UTC so all players worldwide get the same word on the same calendar day.
  const seed =
    now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  return answers[seed % answers.length];
}
