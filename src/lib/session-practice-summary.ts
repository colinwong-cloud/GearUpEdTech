import type { Question } from "@/lib/types";

export interface AnswerLike {
  question: Question;
  isCorrect: boolean;
}

type TypeStats = { type: string; total: number; correct: number };

const TARGET_LO = 50;
const TARGET_HI = 80;

/**
 * 練習小結：約 50–80 字、繁體、鼓勵語氣。依題型正確率產生，不呼叫 LLM（要更細可接 OpenAI 等）。
 */
export function buildSessionPracticeSummary(answers: AnswerLike[], _subject: string): string {
  if (answers.length === 0) {
    return "今次沒有作答，下次再一齊加油，小步也會是進步！";
  }

  const byType: Record<string, TypeStats> = {};
  for (const a of answers) {
    const t = (a.question.question_type || "綜合").trim() || "綜合";
    if (!byType[t]) byType[t] = { type: t, total: 0, correct: 0 };
    byType[t].total++;
    if (a.isCorrect) byType[t].correct++;
  }

  const list = Object.values(byType);
  const rate = (s: TypeStats) => (s.total > 0 ? s.correct / s.total : 0);
  list.sort((a, b) => rate(b) - rate(a));

  const best = list[0];
  const worst = [...list].sort((a, b) => rate(a) - rate(b))[0];
  const overallR = answers.filter((a) => a.isCorrect).length / answers.length;
  const strongName = best && best.total ? best.type : "整體";
  const okStrong = best && best.total > 0 && rate(best) >= 0.5; // use in mid band line
  const weakName =
    worst && worst.total > 0 && rate(worst) < 0.6 ? worst.type : "";
  const needWeak = Boolean(weakName);

  const tip = (name: string): string => {
    if (!name) return "每天幾分鐘小練，就像玩小關卡。";
    if (/應用|文字|讀解/.test(name)) return "買餸找零、讀圖畫卡故事，都係小型應用，輕鬆幫手。";
    if (/圖形|空間|面積|周界/.test(name)) return "街邊睇下招牌圓形、長方形，幫大腦認形狀。";
    if (/分數|小數|百/.test(name)) return "睇下超市價格牌，幾多蚊幾多折，變成小小數學遊戲。";
    if (/計算|四則/.test(name)) return "幫家長量杯、分零食，一邊數一邊練心算。";
    return "讀題慢啲、諗生活例子，就易明白好多。";
  };

  let s = "";
  if (overallR >= 0.8) {
    s = `叻呀！今次成績好亮眼，在「${strongName}」特別有把握，`;
  } else if (overallR >= 0.55) {
    s = `做得好！你肯用心，在「${strongName}」${
      okStrong ? "有唔錯的基礎" : "可以再加把勁"
    }，`;
  } else {
    s = `唔使灰心，學習有上有落好正常。你喺「${strongName}」都仲有可以發揮的位，`;
  }

  if (needWeak && weakName) {
    s += `要留意「${weakName}」可以多練少少；${tip(weakName)}`;
  } else {
    s += "之後可試專心睇清題意，慢慢答都無問題，";
  }

  s += " 下次再一齊，相信自己，加油！";

  s = s.replace(/\s+/g, "");
  if (s.length < TARGET_LO) s += "慢慢嚟，你一定越來越好。";
  if (s.length > TARGET_HI) s = s.slice(0, TARGET_HI);
  let lastP = s.lastIndexOf("。");
  if (lastP >= TARGET_LO - 5 && lastP < s.length) s = s.slice(0, lastP + 1);
  if (s.length < TARGET_LO) s = (s + "繼續努力。").slice(0, TARGET_HI);
  if (s.length < TARGET_LO) s += " 加油！";
  return s;
}

export function charLenZh(s: string): number {
  return s.length;
}
