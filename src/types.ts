export interface Round {
  clue: string;
  answer: string;
  connection: string;
  connectionCharIndices: number[];
  round: number;
}

export interface Puzzle {
  subject: string;
  subjectCategory?: string;
  rounds: [Round, Round, Round, Round];
}

export interface RoundResult {
  solved: boolean;
  score: number;
  lives: number;
  answer: string;
  connection: string;
}
