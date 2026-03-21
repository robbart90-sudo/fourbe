const ANALYTICS_URL = 'https://script.google.com/macros/s/AKfycbz9TGze47raNIEW8TF2wH7dA2KZBnaQ4R2EvgX_TQHsqUbO8n5cb6ZAje3l0UYjbMVF/exec';

export async function trackGameResult(data: {
  puzzle: string;
  r1Score: number;
  r1Lives: number;
  r2Score: number;
  r2Lives: number;
  r3Score: number;
  r3Lives: number;
  r4Score: number;
  r4Lives: number;
  finalGuess: string;
  judgment: string;
  finalScore: number;
  totalScore: number;
}) {
  try {
    await fetch(ANALYTICS_URL, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch {
    // Silent fail — analytics should never break gameplay
  }
}
