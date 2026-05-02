import {
  computeTypeStats,
  rate,
  TARGET_LO,
  TARGET_HI,
  tipForParentWeak,
  type AnswerLike,
} from "./session-practice-summary-core";

export type { AnswerLike } from "./session-practice-summary-core";
export { computeTypeStats, rate, tipForParentWeak } from "./session-practice-summary-core";

/**
 * 學生結果頁：直接對學生說話，約 50–80 字、繁體、鼓勵。
 */
export function buildSessionPracticeSummary(answers: AnswerLike[], _subject: string): string {
  if (answers.length === 0) {
    return "今次沒有作答，下次再一齊加油，小步也會是進步！";
  }

  const list = computeTypeStats(answers);
  list.sort((a, b) => rate(b) - rate(a));

  const best = list[0];
  const worst = [...list].sort((a, b) => rate(a) - rate(b))[0];
  const overallR = answers.filter((a) => a.isCorrect).length / answers.length;
  const strongName = best && best.total ? best.type : "整體";
  const okStrong = best && best.total > 0 && rate(best) >= 0.5;
  const weakName =
    worst && worst.total > 0 && rate(worst) < 0.6 ? worst.type : "";
  const needWeak = Boolean(weakName);

  const tipStudent = (name: string): string => {
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
    s += `要留意「${weakName}」可以多練少少；${tipStudent(weakName)}`;
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

/**
 * 家長電郵：老師視角、對家長說話，約 50–80 字，語氣專業而溫和。
 */
export function buildSessionPracticeSummaryForParent(
  answers: AnswerLike[],
  _subject: string,
  studentName: string
): string {
  const name = studentName.trim() || "同學";
  if (answers.length === 0) {
    return `敬啟者：${name}今節未有作答紀錄，建議下次預留完整時間完成，以便檢視學習狀況。`;
  }

  const list = computeTypeStats(answers);
  list.sort((a, b) => rate(b) - rate(a));
  const best = list[0];
  const worst = [...list].sort((a, b) => rate(a) - rate(b))[0];
  const overallR = answers.filter((a) => a.isCorrect).length / answers.length;
  const strongName = best && best.total ? best.type : "整體";
  const weakName =
    worst && worst.total > 0 && rate(worst) < 0.6 ? worst.type : "";

  let s = "";
  if (overallR >= 0.8) {
    s = `關於${name}今節練習，整體表現良好；「${strongName}」掌握較穩，值得肯定。`;
  } else if (overallR >= 0.55) {
    s = `關於${name}今節練習，表現尚可；「${strongName}」已有一定基礎，仍可依題型再加強。`;
  } else {
    s = `關於${name}今節練習，顯示仍有進步空間；「${strongName}」尚可作為起點，宜循序鞏固。`;
  }

  if (weakName) {
    s += ` 較需留意「${weakName}」。${tipForParentWeak(weakName)}`;
  } else {
    s += " 建議維持規律練習，並留意審題習慣。";
  }

  s += " 如有疑問歡迎回覆與我們聯絡，謝謝。";

  s = s.replace(/\s+/g, "");
  if (s.length < TARGET_LO) s += "祝學習愉快。";
  if (s.length > TARGET_HI) s = s.slice(0, TARGET_HI);
  let lastPeriod = s.lastIndexOf("。");
  if (lastPeriod >= TARGET_LO - 8 && lastPeriod < s.length) s = s.slice(0, lastPeriod + 1);
  if (s.length < TARGET_LO) s = (s + "祝好。").slice(0, TARGET_HI);
  return s;
}

export function charLenZh(s: string): number {
  return s.length;
}
