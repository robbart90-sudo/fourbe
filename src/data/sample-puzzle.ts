import type { Puzzle } from '../types';

export const samplePuzzle: Puzzle = {
  subject: "Dracula",
  subjectCategory: "Character",
  rounds: [
    {
      clue: "Shade associated with passion or danger",
      answer: "BLOOD RED",
      connection: "Dracula drinks blood",
      connectionCharIndices: [],
      round: 1,
    },
    {
      clue: "ABCs of numbers",
      answer: "LEARNING TO COUNT",
      connection: "Count Dracula",
      connectionCharIndices: [],
      round: 2,
    },
    {
      clue: "Konami action series set in a gothic castle",
      answer: "CASTLEVANIA",
      connection: "Dracula is the main antagonist",
      connectionCharIndices: [],
      round: 3,
    },
    {
      clue: "Eastern European region known for medieval fortresses",
      answer: "TRANSYLVANIA",
      connection: "Dracula's homeland",
      connectionCharIndices: [],
      round: 4,
    },
  ],
};
