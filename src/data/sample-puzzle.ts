import type { Puzzle } from '../types';

export const samplePuzzle: Puzzle = {
  subject: "Dracula",
  subjectArticle: "Who I Be?",
  rounds: [
    {
      clue: "Shade associated with passion or danger",
      answer: "BLOOD RED",
      connection: "Dracula drinks blood",
      round: 1,
    },
    {
      clue: "ABCs of numbers",
      answer: "LEARNING TO COUNT",
      connection: "Count Dracula",
      round: 2,
    },
    {
      clue: "Konami action series set in a gothic castle",
      answer: "CASTLEVANIA",
      connection: "Dracula is the main antagonist",
      round: 3,
    },
    {
      clue: "Eastern European region known for medieval fortresses",
      answer: "TRANSYLVANIA",
      connection: "Dracula's homeland",
      round: 4,
    },
  ],
  acceptList: {
    perfect: [
      "Dracula",
      "Count Dracula",
      "Bram Stoker's Dracula",
      "Vlad Dracula",
      "Count Dracula from Transylvania",
    ],
    kindOf: [
      "Vampire",
      "Nosferatu",
      "Vlad the Impaler",
      "Bram Stoker",
      "A vampire",
    ],
  },
};
