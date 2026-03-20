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
      subjectArticle: 'Who am I?',
      rounds: [
        { clue: 'All work and no pay', answer: 'VOLUNTEER', connection: 'College days', round: 1 },
        { clue: '___ and two zig zags, baby that\'s all we need', answer: 'COLT FORTY-FIVE', connection: 'Pro days', round: 2 },
        { clue: "Warren Buffett's notable nickname", answer: 'THE WIZARD OF OMAHA', connection: 'Audible plays', round: 3 },
        { clue: 'Paying $1 on a .75¢ bill', answer: 'QUARTERBACK', connection: 'Positional ways', round: 4 },
      ],
      acceptList: {
        perfect: ['Peyton Manning', 'Peyton', 'Manning', 'Peyton Williams Manning'],
        kindOf: ['Colts quarterback', 'Denver quarterback', 'Indianapolis quarterback', 'Manning brother', "Eli's brother", "Archie's son", 'NFL quarterback', 'football player'],
      },
    },
  },
  {
    date: '2026-03-23',
    puzzle: {
      subject: 'Abraham Lincoln',
      subjectArticle: 'Who am I?',
      rounds: [
        { clue: 'No kindling needed', answer: 'DURAFLAME LOGS', connection: 'Log Cabin Lodger', round: 1 },
        { clue: 'Grappling and throwing, just no punching', answer: 'WRESTLING', connection: 'Unofficial Illinois State Champ', round: 2 },
        { clue: 'Captain America vs. Iron Man', answer: 'CIVIL WAR', connection: 'Only in the comics', round: 3 },
        { clue: 'To err truthfully', answer: 'AN HONEST MISTAKE', connection: "Didn't even lie about a cherry tree", round: 4 },
      ],
      acceptList: {
        perfect: ['Abraham Lincoln', 'Abe Lincoln', 'Lincoln', 'President Lincoln', 'Honest Abe', 'The Great Emancipator', 'The Rail Splitter', 'A. Lincoln', 'Abraham Lincoln President'],
        kindOf: ['President', 'Civil War President', 'Republican President', 'American President', 'US President', 'Illinois President', 'Emancipation Proclamation', 'Log cabin president', 'Rail splitter', 'Great Emancipator', 'Union leader', 'Civil War leader', 'Kentucky president', 'Illinois politician', 'Republican', 'Politician', 'Historical figure'],
      },
    },
  },
  {
    date: '2026-03-24',
    puzzle: {
      subject: 'Arthur (the Aardvark)',
      subjectArticle: 'Who am I?',
      rounds: [
        { clue: 'Unlimited books with a swipe', answer: 'LIBRARY CARD', connection: 'Arthur wrote a song about it', round: 1 },
        { clue: 'Bug ranch?', answer: 'ANT FARM', connection: 'Aardvarks eat ants', round: 2 },
        { clue: 'Funded by viewers like you', answer: 'PUBLIC BROADCASTING SERVICE', connection: "Arthur's TV home", round: 3 },
        { clue: 'Hand-based stress reactions', answer: 'CLENCHED FIST', connection: "Arthur got meme'd", round: 4 },
      ],
      acceptList: {
        perfect: ['Arthur', 'Arthur the Aardvark', 'Arthur Read', 'Arthur Timothy Read', 'PBS Arthur', 'Arthur TV show', 'Arthur cartoon', 'Arthur series', 'Arthur PBS', "Arthur children's show"],
        kindOf: ['PBS Kids', 'public television', "children's television", 'educational TV', 'DW', 'Francine', 'Buster', 'animated series', 'cartoon character', 'educational cartoon', 'Arthur books'],
      },
    },
  },
  {
    date: '2026-03-25',
    puzzle: {
      subject: "Texas Hold 'Em",
      subjectArticle: 'What am I?',
      rounds: [
        { clue: 'Slang: when a pop artist fails publicly', answer: 'IN THEIR FLOP ERA', connection: 'Check...', round: 1 },
        { clue: 'The Byrds on Ed Sullivan in 1965', answer: 'TURN TURN TURN', connection: 'Check...', round: 2 },
        { clue: 'The Allegheny, The Monongahela, and The Ohio', answer: 'RIVERS OF PITTSBURGH', connection: "I'm all in...", round: 3 },
        { clue: "King Charles' Preferred Plumbing Service", answer: 'THE ROYAL FLUSH', connection: '... you called me with ace-high?!', round: 4 },
      ],
      acceptList: {
        perfect: ["Texas Hold 'Em", "Texas Hold'em", 'Texas Holdem', "Hold 'Em", "Hold'em", 'Holdem', 'Texas Hold em poker', "Texas hold 'em poker", 'Texas holdem poker'],
        kindOf: ['poker', 'card game', 'gambling', 'casino game', 'poker variant', 'betting game', 'cards', 'poker game'],
      },
    },
  },
  {
    date: '2026-03-26',
    puzzle: {
      subject: 'The Marianas Trench',
      subjectArticle: 'What am I?',
      rounds: [
        { clue: 'Movie: LL Cool J sautés a shark', answer: 'DEEP BLUE SEA', connection: 'Going down...', round: 1 },
        { clue: 'A Chicago delicacy', answer: 'DEEP DISH PIZZA', connection: 'Down...', round: 2 },
        { clue: 'Adele breakout hit', answer: 'ROLLING IN THE DEEP', connection: '... down...', round: 3 },
        { clue: 'The perfect disguise for two kids to pass as one adult', answer: 'A TRENCH COAT', connection: "Oh, there's a trench!", round: 4 },
      ],
      acceptList: {
        perfect: ['The Marianas Trench', 'Mariana Trench', 'Marianas Trench', 'The Mariana Trench', "Mariana's Trench", 'Marianas', 'Mariana'],
        kindOf: ['Ocean trench', 'Deep sea trench', 'Pacific trench', 'Deepest part of the ocean', 'Deepest point on Earth', 'Ocean floor', 'Deep ocean', 'Oceanic trench', 'Underwater canyon'],
      },
    },
  },
];

export function getHardcodedPuzzle(date: string): Puzzle | null {
  const entry = hardcodedPuzzles.find((e) => e.date === date);
  return entry?.puzzle ?? null;
}
