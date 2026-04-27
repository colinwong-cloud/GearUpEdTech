# 練習小結（Practice session summary）— 測試計劃

## 自動測試（本機 / CI）
- 執行：`npm test`（vitest，見 `src/lib/session-practice-summary.test.ts`）
- 核對：小結字數 50–80 字、含強／弱題型、空列表有後備文句。

**最近一次執行（開發機）：`npm test` — 4/4 通過。**

## 手動 — 學生端
1. 登入學生 → 完成 10 題有至少兩種 `question_type` 的測驗。  
2. 結果頁在「X/X」與「% 正確」**下方**應出現**小香蕉頭像** + 對話**泡泡**內的繁中小結。  
3. 內容須**鼓勵、含強項與可改進、附生活化建議**（實作為規則生成，非 LLM）。  
4. 小結長度感覺約 **3–4 行**（約 50–80 字）。

## 手動 — 家長電郵
1. 有電郵與通知開啟的帳戶完成一節練習。  
2. 郵件在**正確率大框之後、科目/用時表格之前**有一節 **「教練小結（本節練習）」**，文字與 App 內**一致**（可優先用 Body 的 `session_summary`）。

## 資料庫
1. Supabase 已執行 `supabase_session_practice_summary.sql`。  
2. 在 Table Editor 開 `quiz_sessions`，剛完結的 `session` 的 `session_practice_summary` 有文字。

## 未接 LLM 之限制
- 產生方式為**規則 + 題型字串**；不會「讀懂」題幹。若要個人化長文或英文版，可改為呼叫 **OpenAI / 其他 LLM API**（在 `finalizeQuizAndSummary` 內或獨立 Edge Function）並仍寫入同欄位。
