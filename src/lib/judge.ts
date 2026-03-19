import type { Puzzle } from '../types';

export type Judgment = 'Perfect!' | 'Kind Of!' | 'Not Quite...';
export type FinalJudgment = Judgment | 'Time!';

export interface JudgeResult {
  judgment: FinalJudgment;
  score: number;
}

function normalize(s: string): string {
  return s.toUpperCase().replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function maxDistance(entry: string): number {
  return entry.length >= 8 ? 2 : 1;
}

function fuzzyMatch(guess: string, list: string[]): boolean {
  for (const entry of list) {
    const dist = levenshtein(guess, entry);
    if (dist <= maxDistance(entry)) return true;
  }
  return false;
}

export function judgeGuess(guess: string, puzzle: Puzzle): JudgeResult {
  const normalized = normalize(guess);

  // Build normalized lists — subject is always auto-included in perfect
  const perfectList = [puzzle.subject, ...(puzzle.acceptList?.perfect || [])].map(normalize);
  const kindOfList = (puzzle.acceptList?.kindOf || []).map(normalize);

  // 1. Exact match against perfect list
  if (perfectList.includes(normalized)) return { judgment: 'Perfect!', score: 2000 };
  // 2. Fuzzy match against perfect list
  if (fuzzyMatch(normalized, perfectList)) return { judgment: 'Perfect!', score: 2000 };
  // 3. Exact match against kind-of list
  if (kindOfList.includes(normalized)) return { judgment: 'Kind Of!', score: 500 };
  // 4. Fuzzy match against kind-of list
  if (fuzzyMatch(normalized, kindOfList)) return { judgment: 'Kind Of!', score: 500 };
  // 5. No match
  return { judgment: 'Not Quite...', score: 0 };
}

// --- AI generation for editor accept lists ---
export async function generateAcceptList(
  subject: string,
  answers: string[],
): Promise<{ perfect: string[]; kindOf: string[] }> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('API key not configured');

  const response = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You are helping create a word puzzle. The puzzle has a hidden subject that players must guess after seeing four clue answers. Generate lists of acceptable player guesses at two tiers.

PERFECT tier — guesses that clearly and specifically identify the subject. Include: the exact name, common alternate names, full names, abbreviated names, nicknames that unambiguously refer to this subject, and phrases that could only mean this subject.

KIND OF tier — guesses that are in the right territory but not specific enough, or closely related but technically a different thing. Include: broader categories the subject belongs to, common associations that aren't quite the subject itself, related figures or concepts a player might confuse with the subject.

Return ONLY a JSON object with this format:
{"perfect": ["answer1", "answer2", ...], "kindOf": ["answer1", "answer2", ...]}`,
      messages: [
        {
          role: 'user',
          content: `The subject is: "${subject}"\nThe four round answers are: ${answers.join(', ')}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 404) throw new Error('AI generation only available in local development');
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  let text = data.content?.[0]?.text ?? '';
  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  const parsed = JSON.parse(text);

  return {
    perfect: Array.isArray(parsed.perfect) ? parsed.perfect.filter((s: unknown) => typeof s === 'string') : [],
    kindOf: Array.isArray(parsed.kindOf) ? parsed.kindOf.filter((s: unknown) => typeof s === 'string') : [],
  };
}
