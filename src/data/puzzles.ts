import type { Puzzle } from '../types';

export interface HardcodedPuzzleEntry {
  date: string;
  puzzle: Puzzle;
}

export const hardcodedPuzzles: HardcodedPuzzleEntry[] = [
  {
    date: '2026-03-22',
    puzzle: {
      subject: 'Peyton Manning',
      subjectCategory: 'Person',
      rounds: [
        { clue: 'All work and no pay', answer: 'VOLUNTEER', connection: 'College days', connectionCharIndices: [], round: 1 },
        { clue: '___ and two zig zags, baby that\'s all we need', answer: 'COLT FORTY-FIVE', connection: 'Pro days', connectionCharIndices: [], round: 2 },
        { clue: "Warren Buffett's notable nickname", answer: 'THE WIZARD OF OMAHA', connection: 'Audible plays', connectionCharIndices: [], round: 3 },
        { clue: 'Paying $1 on a .75¢ bill', answer: 'QUARTERBACK', connection: 'Positional ways', connectionCharIndices: [], round: 4 },
      ],
    },
  },
  {
    date: '2026-03-23',
    puzzle: {
      subject: 'Abraham Lincoln',
      subjectCategory: 'Person',
      rounds: [
        { clue: 'No kindling needed', answer: 'DURAFLAME LOGS', connection: 'Log Cabin Lodger', connectionCharIndices: [], round: 1 },
        { clue: 'Grappling and throwing, just no punching', answer: 'WRESTLING', connection: 'Unofficial Illinois State Champ', connectionCharIndices: [], round: 2 },
        { clue: 'Captain America vs. Iron Man', answer: 'CIVIL WAR', connection: 'Only in the comics', connectionCharIndices: [], round: 3 },
        { clue: 'To err truthfully', answer: 'AN HONEST MISTAKE', connection: "Didn't even lie about a cherry tree", connectionCharIndices: [], round: 4 },
      ],
    },
  },
  {
    date: '2026-03-24',
    puzzle: {
      subject: 'Arthur (the Aardvark)',
      subjectCategory: 'Character',
      rounds: [
        { clue: 'Unlimited books with a swipe', answer: 'LIBRARY CARD', connection: 'Arthur wrote a song about it', connectionCharIndices: [], round: 1 },
        { clue: 'Bug ranch?', answer: 'ANT FARM', connection: 'Aardvarks eat ants', connectionCharIndices: [], round: 2 },
        { clue: 'Funded by viewers like you', answer: 'PUBLIC BROADCASTING SERVICE', connection: "Arthur's TV home", connectionCharIndices: [], round: 3 },
        { clue: 'Hand-based stress reactions', answer: 'CLENCHED FIST', connection: "Arthur got meme'd", connectionCharIndices: [], round: 4 },
      ],
    },
  },
  {
    date: '2026-03-25',
    puzzle: {
      subject: "Texas Hold 'Em",
      subjectCategory: 'Game',
      rounds: [
        { clue: 'Slang: when a pop artist fails publicly', answer: 'IN THEIR FLOP ERA', connection: 'Check...', connectionCharIndices: [], round: 1 },
        { clue: 'The Byrds on Ed Sullivan in 1965', answer: 'TURN TURN TURN', connection: 'Check...', connectionCharIndices: [], round: 2 },
        { clue: 'The Allegheny, The Monongahela, and The Ohio', answer: 'RIVERS OF PITTSBURGH', connection: "I'm all in...", connectionCharIndices: [], round: 3 },
        { clue: "King Charles' Preferred Plumbing Service", answer: 'THE ROYAL FLUSH', connection: '... you called me with ace-high?!', connectionCharIndices: [], round: 4 },
      ],
    },
  },
  {
    date: '2026-03-26',
    puzzle: {
      subject: 'The Marianas Trench',
      subjectCategory: 'Place',
      rounds: [
        { clue: 'Movie: LL Cool J sautés a shark', answer: 'DEEP BLUE SEA', connection: 'Going down...', connectionCharIndices: [], round: 1 },
        { clue: 'A Chicago delicacy', answer: 'DEEP DISH PIZZA', connection: 'Down...', connectionCharIndices: [], round: 2 },
        { clue: 'Adele breakout hit', answer: 'ROLLING IN THE DEEP', connection: '... down...', connectionCharIndices: [], round: 3 },
        { clue: 'The perfect disguise for two kids to pass as one adult', answer: 'A TRENCH COAT', connection: "Oh, there's a trench!", connectionCharIndices: [], round: 4 },
      ],
    },
  },
];

export function getHardcodedPuzzle(date: string): Puzzle | null {
  const entry = hardcodedPuzzles.find((e) => e.date === date);
  return entry?.puzzle ?? null;
}
