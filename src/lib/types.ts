export interface Parent {
  id: string;
  mobile_number: string;
  parent_name: string | null;
  email: string | null;
  created_at: string;
}

export interface Student {
  id: string;
  parent_id: string;
  student_name: string;
  pin_code: string | null;
  avatar_style: string;
  grade_level: string;
  created_at: string;
  /** "M" | "F" | null — optional, see profile edit / admin business KPIs */
  gender?: string | null;
}

export interface Question {
  id: string;
  past_paper_id: string | null;
  subject: string;
  question_type: string;
  paper_rank: string;
  grade_level: string;
  content: string;
  opt_a: string | null;
  opt_b: string | null;
  opt_c: string | null;
  opt_d: string | null;
  correct_answer: string;
  explanation: string | null;
  image_url: string | null;
  created_at: string;
  question_key: string | null;
  source: string | null;
}

export interface QuizSession {
  id: string;
  student_id: string | null;
  subject: string;
  questions_attempted: number;
  score: number;
  time_spent_seconds: number;
  created_at: string;
  session_token: string | null;
}

export interface SessionAnswer {
  id: string;
  session_id: string;
  question_id: string;
  student_answer: string | null;
  is_correct: boolean;
  created_at: string;
  question_order: number | null;
}

export interface ParentWeight {
  id: string;
  student_id: string;
  subject: string;
  question_type: string;
  weight_percentage: number;
}

export interface StudentBalance {
  id: string;
  student_id: string;
  subject: string;
  remaining_questions: number;
}

export interface StudentRankPerformance {
  id: string;
  student_id: string;
  subject: string;
  paper_rank: string;
  questions_attempted: number;
  questions_correct: number;
  last_updated: string;
}

export interface AnswerRecord {
  question: Question;
  studentAnswer: string;
  isCorrect: boolean;
}
