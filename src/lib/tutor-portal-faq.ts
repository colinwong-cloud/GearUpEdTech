export type TutorFaqItem = {
  question: string;
  answer: string;
};

export type TutorFaqSection = {
  title: string;
  items: TutorFaqItem[];
};

const SECTION_RE = /^[一二三四五六七八九十]+、/;
const QUESTION_RE = /^(\d+)\.\s+(.+)$/;

/** Parse the public tutor FAQ text into section headings and numbered answers. */
export function parseTutorPortalFaq(text: string): TutorFaqSection[] {
  const sections: TutorFaqSection[] = [];
  let current: TutorFaqSection | null = null;
  let question: string | null = null;
  let answer: string[] = [];

  const flushQuestion = () => {
    if (!current || !question) {
      question = null;
      answer = [];
      return;
    }
    const body = answer.join("\n").trim();
    if (body) current.items.push({ question, answer: body });
    question = null;
    answer = [];
  };

  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (SECTION_RE.test(line)) {
      flushQuestion();
      current = { title: line, items: [] };
      sections.push(current);
      continue;
    }
    const numbered = line.match(QUESTION_RE);
    if (numbered) {
      flushQuestion();
      if (!current) {
        current = { title: "常見問題", items: [] };
        sections.push(current);
      }
      question = numbered[2];
      continue;
    }
    if (question) answer.push(line);
  }
  flushQuestion();
  return sections.filter((section) => section.items.length > 0);
}
