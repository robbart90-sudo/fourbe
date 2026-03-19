export interface Round {
  clue: string;
  answer: string;
  connection: string;
  round: number;
}

export interface AcceptList {
  perfect: string[];
  kindOf: string[];
}

export interface Puzzle {
  subject: string;
  subjectArticle: string;
  rounds: [Round, Round, Round, Round];
  acceptList?: AcceptList;
}

export interface RoundResult {
  solved: boolean;
  score: number;
  answer: string;
  connection: string;
}
