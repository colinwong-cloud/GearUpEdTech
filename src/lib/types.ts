export interface Question {
  id: string;
  content: string;
  opt_a: string | null;
  opt_b: string | null;
  opt_c: string | null;
  opt_d: string | null;
  correct_answer: string;
  explanation: string;
  subject: string;
  grade_level: string;
  image_url: string | null;
}

export interface QuizSession {
  id: string;
  student_id: string;
  subject: string;
  questions_attempted: number;
  score: number;
  time_spent_seconds: number;
}

export interface SessionAnswer {
  id: string;
  session_id: string;
  question_id: string;
  student_answer: string;
  is_correct: boolean;
}

export interface AnswerRecord {
  question: Question;
  studentAnswer: string;
  isCorrect: boolean;
}
